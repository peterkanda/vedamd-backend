import { beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedOperator } from '../src/common/operator-auth';
import type { AppConfig } from '../src/config/configuration';
import { ContentReviewService } from '../src/modules/governance/content-review.service';
import type { SubmitReviewDto } from '../src/modules/governance/content-review.types';
import { GovernanceService } from '../src/modules/governance/governance.service';
import { loadCorrectionProposals } from '../src/modules/governance/corrections';
import { recordContentHash } from '../src/modules/governance/record-hash';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * Clinical content review (FR-024). The invariants that keep approval from
 * becoming a rubber stamp: identity comes from auth, only registered reviewers
 * count, two distinct reviewers are required, a decision only applies to the
 * exact content reviewed, and nothing touches the signed bundle.
 */

const knowledge = makeKnowledgeService();
const governance = new GovernanceService(knowledge);

function makeSvc(reviewerSubs = ['rev-a', 'rev-b', 'rev-c']): ContentReviewService {
  const config = {
    get: (key: string) => (key === 'content.reviewerSubs' ? reviewerSubs : undefined),
  } as unknown as ConfigService<AppConfig, true>;
  const svc = new ContentReviewService(knowledge, governance, config, null);
  svc.onModuleInit();
  return svc;
}

const op = (sub: string, extra: Partial<AuthenticatedOperator> = {}): AuthenticatedOperator => ({
  sub,
  integratorId: 'int-1',
  viaDevBypass: false,
  claims: { name: `Dr ${sub}` },
  ...extra,
});

let svc: ContentReviewService;
let hash: string;
const target = { domain: 'drugs', recordId: 'paracetamol' };
const approve = (h = hash): SubmitReviewDto => ({
  ...target,
  recordHash: h,
  decision: 'approve',
  role: 'Clinical Pharmacologist',
});

beforeEach(async () => {
  svc = makeSvc();
  hash = (await svc.packet(target.domain, target.recordId)).recordHash;
});

describe('review queue', () => {
  it('orders by clinical-risk tier and counts every unapproved record', async () => {
    const page = await svc.queue({ limit: 500 });
    const tiers = page.items.map((i) => i.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    expect(page.items[0].tier).toBe(1);
    const counted = Object.values(page.counts).reduce((a, b) => a + b, 0);
    // Every bundle record plus every correction proposal.
    expect(counted).toBe(
      governance.report().totals.records + loadCorrectionProposals().proposals.length,
    );
  });

  it('filters by domain, tier and state', async () => {
    const drugs = await svc.queue({ domain: 'drugs', limit: 5 });
    expect(drugs.items.every((i) => i.domain === 'drugs')).toBe(true);
    const t3 = await svc.queue({ tier: 3, limit: 5 });
    expect(t3.items.every((i) => i.tier === 3)).toBe(true);
    expect((await svc.queue({ state: 'ready-to-promote' })).total).toBe(0);
  });

  it('addresses records by bundle file domain and by id where records have no slug', async () => {
    const rule = await svc.packet('cds-rules', 'ddi-check');
    expect(rule.recordId).toBe('ddi-check');
    const ddi = await svc.queue({ domain: 'drug-disease-interactions', limit: 1 });
    expect(ddi.total).toBeGreaterThan(0);
    // Interactions carry slugA/slugB only; the pair key is order-independent.
    const pair = await svc.packet('drug-interactions', 'paracetamol+warfarin');
    expect(pair.tier).toBe(1);
  });

  it('flags a drug whose RxNorm code is quarantined and blocks its approval', async () => {
    const p = await svc.packet('drugs', 'hydroxyzine');
    expect(p.flags.quarantinedCode).toBe(true);
    expect(p.approvalBlockers.length).toBeGreaterThan(0);
    await expect(
      svc.submit({ ...approve(p.recordHash), recordId: 'hydroxyzine' }, op('rev-a')),
    ).rejects.toThrow(/Approval refused/);
  });
});

describe('submitting decisions', () => {
  it('rejects operators who are not registered clinical reviewers', async () => {
    await expect(svc.submit(approve(), op('someone-else'))).rejects.toThrow(/not a registered/);
    await expect(svc.submit(approve(), undefined)).rejects.toThrow(/authentication/);
  });

  it('rejects a stale content hash', async () => {
    await expect(svc.submit(approve('0'.repeat(64)), op('rev-a'))).rejects.toThrow(
      /does not match/,
    );
  });

  it('requires a role, and notes when requesting changes', async () => {
    await expect(svc.submit({ ...approve(), role: ' ' }, op('rev-a'))).rejects.toThrow(/role/);
    await expect(
      svc.submit({ ...approve(), decision: 'request-changes' }, op('rev-a')),
    ).rejects.toThrow(/notes/);
  });

  it('takes the reviewer identity from the token, not the body', async () => {
    const d = await svc.submit(
      { ...approve(), reviewerName: 'Someone Else' } as SubmitReviewDto,
      op('rev-a'),
    );
    expect(d.reviewerSub).toBe('rev-a');
    expect(d.reviewerName).toBe('Dr rev-a');
  });

  it('refuses a duplicate approval from the same reviewer', async () => {
    await svc.submit(approve(), op('rev-a'));
    await expect(svc.submit(approve(), op('rev-a'))).rejects.toThrow(/already approved/);
  });
});

describe('two-reviewer rule and export', () => {
  it('needs two distinct reviewers before a record is ready to promote', async () => {
    await svc.submit(approve(), op('rev-a'));
    expect((await svc.packet(target.domain, target.recordId)).state).toBe('needs-second-review');
    expect((await svc.exportApprovals()).approvals).toEqual([]);

    await svc.submit(approve(), op('rev-b'));
    const packet = await svc.packet(target.domain, target.recordId);
    expect(packet.state).toBe('ready-to-promote');
    const exp = await svc.exportApprovals();
    expect(exp.approvals).toHaveLength(1);
    expect(exp.approvals[0]).toMatchObject({ ...target, recordHash: hash });
    expect(exp.approvals[0].reviewers.map((r) => r.name).sort()).toEqual(['Dr rev-a', 'Dr rev-b']);
  });

  it('a later change request blocks promotion until that reviewer approves again', async () => {
    await svc.submit(approve(), op('rev-a'));
    await svc.submit(approve(), op('rev-b'));
    await svc.submit(
      { ...approve(), decision: 'request-changes', notes: 'Max daily dose missing for <50 kg.' },
      op('rev-c'),
    );
    expect((await svc.packet(target.domain, target.recordId)).state).toBe('changes-requested');
    expect((await svc.exportApprovals()).approvals).toEqual([]);

    await svc.submit(approve(), op('rev-c'));
    expect((await svc.exportApprovals()).approvals[0].reviewers).toHaveLength(3);
  });

  it('never counts dev-bypass decisions toward FR-024', async () => {
    await svc.submit(approve(), op('dev-1', { viaDevBypass: true, claims: null }));
    await svc.submit(approve(), op('dev-2', { viaDevBypass: true, claims: null }));
    const p = await svc.packet(target.domain, target.recordId);
    expect(p.approvals).toBe(0);
    expect(p.decisions).toHaveLength(2);
    expect((await svc.exportApprovals()).approvals).toEqual([]);
  });
});

describe('recordContentHash', () => {
  const rec = { slug: 'x', inn: 'x', dosing: { adult: [{ route: 'oral', regimen: '1 g' }] } };

  it('ignores key order and review metadata', () => {
    const reordered = { dosing: rec.dosing, inn: 'x', slug: 'x' };
    const reviewed = {
      ...rec,
      reviewStatus: 'approved',
      reviewers: [{ name: 'A', role: 'B', reviewedAt: 'now' }],
      approvedAt: 'now',
    };
    expect(recordContentHash(reordered)).toBe(recordContentHash(rec));
    expect(recordContentHash(reviewed)).toBe(recordContentHash(rec));
  });

  it('changes when any clinical content changes', () => {
    const edited = { ...rec, dosing: { adult: [{ route: 'oral', regimen: '2 g' }] } };
    expect(recordContentHash(edited)).not.toBe(recordContentHash(rec));
  });
});

describe('bundle:promote --from-decisions', () => {
  const SCRIPT = resolve(__dirname, '../scripts/promote-bundle.ts');
  const drug = (slug: string, strength = 'A') => ({
    slug,
    inn: slug,
    references: [{ label: 'x', strength }],
    reviewStatus: 'draft',
  });
  const reviewers = [
    { name: 'Dr A', role: 'Physician', reviewedAt: '2026-09-19T00:00:00.000Z' },
    { name: 'Dr B', role: 'Pharmacist', reviewedAt: '2026-09-19T00:00:00.000Z' },
  ];

  function run(bundle: Record<string, unknown[]>, approvals: unknown[]) {
    const dir = mkdtempSync(join(tmpdir(), 'vedamd-decisions-'));
    try {
      for (const [f, recs] of Object.entries(bundle)) {
        writeFileSync(join(dir, `${f}.json`), JSON.stringify(recs));
      }
      const decisions = join(dir, 'decisions.json');
      writeFileSync(decisions, JSON.stringify({ approvals }));
      let code = 0;
      let err = '';
      try {
        execFileSync(
          'npx',
          ['ts-node', '--transpile-only', SCRIPT, '--bundle', dir, '--from-decisions', decisions],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (e) {
        code = (e as { status?: number }).status ?? 1;
        err = String((e as { stderr?: string }).stderr ?? '');
      }
      const after: Record<string, Array<Record<string, unknown>>> = {};
      for (const f of Object.keys(bundle)) {
        after[f] = JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8'));
      }
      return { code, err, after };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('approves records whose reviewed hash still matches, including id- and pair-keyed records', () => {
    const a = drug('alpha');
    const rule = {
      id: 'rule-1',
      references: [{ label: 'x', strength: 'A' }],
      reviewStatus: 'draft',
    };
    const ddi = {
      slugA: 'warfarin',
      slugB: 'alpha',
      references: [{ label: 'x', strength: 'A' }],
      reviewStatus: 'draft',
    };
    const r = run({ drugs: [a], 'cds-rules': [rule], 'drug-interactions': [ddi] }, [
      { domain: 'drugs', recordId: 'alpha', recordHash: recordContentHash(a), reviewers },
      {
        domain: 'drug-interactions',
        recordId: 'alpha+warfarin',
        recordHash: recordContentHash(ddi),
        reviewers,
      },
      { domain: 'cds-rules', recordId: 'rule-1', recordHash: recordContentHash(rule), reviewers },
    ]);
    expect(r.code).toBe(0);
    expect(r.after.drugs[0]).toMatchObject({ reviewStatus: 'approved', reviewers });
    expect(r.after.drugs[0].approvedAt).toBeTruthy();
    expect(r.after['cds-rules'][0].reviewStatus).toBe('approved');
    expect(r.after['drug-interactions'][0].reviewStatus).toBe('approved');
  }, 60_000);

  it('refuses the whole batch when any record changed after review', () => {
    const a = drug('alpha');
    const b = drug('beta');
    const r = run({ drugs: [a, b] }, [
      { domain: 'drugs', recordId: 'alpha', recordHash: recordContentHash(a), reviewers },
      { domain: 'drugs', recordId: 'beta', recordHash: 'stale', reviewers },
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/hash mismatch/);
    expect(r.after.drugs.map((x) => x.reviewStatus)).toEqual(['draft', 'draft']);
  }, 60_000);

  it('re-checks FR-024 and the D-tier rule instead of trusting the export', () => {
    const d = drug('delta', 'D');
    const e = drug('echo');
    const r = run({ drugs: [d, e] }, [
      { domain: 'drugs', recordId: 'delta', recordHash: recordContentHash(d), reviewers },
      {
        domain: 'drugs',
        recordId: 'echo',
        recordHash: recordContentHash(e),
        reviewers: [reviewers[0], { ...reviewers[0], role: 'Other' }],
      },
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/D-tier/);
    expect(r.err).toMatch(/two distinct named reviewers/);
  }, 60_000);
});
