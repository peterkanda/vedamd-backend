import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedOperator } from '../src/common/operator-auth';
import type { AppConfig } from '../src/config/configuration';
import { ContentReviewService } from '../src/modules/governance/content-review.service';
import {
  applyCorrection,
  correctionConflicts,
  loadCorrectionProposals,
  type CorrectionProposal,
} from '../src/modules/governance/corrections';
import { GovernanceService } from '../src/modules/governance/governance.service';
import { recordContentHash } from '../src/modules/governance/record-hash';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * Correction proposals: audit-verified fixes, human-approved, applied only to
 * the next bundle version. The invariants: a proposal applies only to the
 * exact content it was generated against, only to correctable fields, only
 * with two reviewers, and a corrected record always returns to draft.
 */

const rec = { slug: 'hydroxyzine', inn: 'hydroxyzine', rxnorm: '5552', reviewStatus: 'draft' };
const proposal = (over: Partial<CorrectionProposal> = {}): CorrectionProposal => ({
  id: 'rxnorm:hydroxyzine',
  kind: 'set-field',
  domain: 'drugs',
  recordId: 'hydroxyzine',
  baseHash: recordContentHash(rec),
  changes: [{ field: 'rxnorm', from: '5552', to: '5553' }],
  rationale: 'test',
  evidence: [],
  generatedBy: 'test',
  ...over,
});

describe('correction rules', () => {
  it('applies to the exact content it was generated against', () => {
    expect(correctionConflicts(proposal(), rec)).toEqual([]);
    expect(correctionConflicts(proposal(), { ...rec, inn: 'hydroxyzine hcl' })).toContain(
      'target record changed since the proposal was generated',
    );
    expect(correctionConflicts(proposal(), undefined)[0]).toMatch(/not found/);
  });

  it('returns the corrected record to draft with review metadata cleared', () => {
    const approved = { ...rec, reviewStatus: 'approved', reviewers: [{}, {}], approvedAt: 'x' };
    const next = applyCorrection(proposal(), approved);
    expect(next).toMatchObject({ rxnorm: '5553', reviewStatus: 'draft' });
    expect(next.reviewers).toBeUndefined();
    expect(next.approvedAt).toBeUndefined();
    expect(approved.rxnorm).toBe('5552'); // input untouched
  });

  it('only loads proposals for correctable fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vedamd-corr-'));
    try {
      const file = join(dir, 'p.json');
      writeFileSync(
        file,
        JSON.stringify({
          proposals: [
            proposal(),
            proposal({ id: 'bad', changes: [{ field: 'dosing' as 'rxnorm', from: 1, to: 2 }] }),
            { id: 'junk' },
          ],
        }),
      );
      const loaded = loadCorrectionProposals(file);
      expect(loaded.proposals.map((p) => p.id)).toEqual(['rxnorm:hydroxyzine']);
      expect(loaded.rejected).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('generated proposals file', () => {
  const { proposals, rejected } = loadCorrectionProposals();
  const drugs = new Map(
    makeKnowledgeService()
      .getDrugs()
      .map((d) => [d.slug, d]),
  );

  it('is well-formed and applies cleanly to the shipped bundle', () => {
    expect(rejected).toBe(0);
    expect(proposals.length).toBeGreaterThan(0);
    const conflicted = proposals.filter(
      (p) => correctionConflicts(p, drugs.get(p.recordId) as never).length > 0,
    );
    expect(conflicted.map((p) => p.id)).toEqual([]);
  });
});

describe('corrections in the review queue', () => {
  const knowledge = makeKnowledgeService();
  const config = {
    get: (key: string) => (key === 'content.reviewerSubs' ? ['rev-a', 'rev-b'] : undefined),
  } as unknown as ConfigService<AppConfig, true>;
  const op = (sub: string): AuthenticatedOperator => ({
    sub,
    integratorId: 'i',
    viaDevBypass: false,
    claims: { name: `Dr ${sub}` },
  });

  it('are reviewed at the target record’s tier and exported separately from records', async () => {
    const svc = new ContentReviewService(knowledge, new GovernanceService(knowledge), config, null);
    svc.onModuleInit();
    const p = await svc.packet('corrections', 'rxnorm:hydroxyzine');
    expect(p.tier).toBe(1);
    expect(p.approvalBlockers).toEqual([]);
    expect(p.title).toContain('rxnorm');

    const body = {
      domain: 'corrections',
      recordId: 'rxnorm:hydroxyzine',
      recordHash: p.recordHash,
      decision: 'approve' as const,
      role: 'Clinical Pharmacologist',
    };
    await svc.submit(body, op('rev-a'));
    await svc.submit(body, op('rev-b'));
    const exp = await svc.exportApprovals();
    expect(exp.approvals).toEqual([]);
    expect(exp.corrections).toHaveLength(1);
    expect(exp.corrections[0].proposal.id).toBe('rxnorm:hydroxyzine');
    expect(exp.corrections[0].proposalHash).toBe(p.recordHash);
  });
});

describe('corrections:apply', () => {
  const SCRIPT = resolve(__dirname, '../scripts/apply-corrections.ts');
  const reviewers = [
    { name: 'Dr A', role: 'Physician', reviewedAt: 'now' },
    { name: 'Dr B', role: 'Pharmacist', reviewedAt: 'now' },
  ];

  function run(drugs: unknown[], corrections: unknown[], bundleName = 'v0.2.0') {
    const root = mkdtempSync(join(tmpdir(), 'vedamd-apply-'));
    const dir = join(root, bundleName);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'drugs.json'), JSON.stringify(drugs));
      const file = join(root, 'export.json');
      writeFileSync(file, JSON.stringify({ approvals: [], corrections }));
      let code = 0;
      let err = '';
      try {
        execFileSync(
          'npx',
          ['ts-node', '--transpile-only', SCRIPT, '--bundle', dir, '--from-decisions', file],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
      } catch (e) {
        code = (e as { status?: number }).status ?? 1;
        err = String((e as { stderr?: string }).stderr ?? '');
      }
      return { code, err, drugs: JSON.parse(readFileSync(join(dir, 'drugs.json'), 'utf8')) };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('applies an approved correction and returns the record to draft', () => {
    const p = proposal();
    const r = run([rec], [{ proposal: p, proposalHash: recordContentHash(p), reviewers }]);
    expect(r.code).toBe(0);
    expect(r.drugs[0]).toMatchObject({ rxnorm: '5553', reviewStatus: 'draft' });
  }, 60_000);

  it('refuses a proposal altered after review, or a changed target, and writes nothing', () => {
    const p = proposal();
    const tampered = { ...p, changes: [{ field: 'rxnorm', from: '5552', to: '9999' }] };
    const r = run([rec], [{ proposal: tampered, proposalHash: recordContentHash(p), reviewers }]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/hash mismatch/);
    expect(r.drugs[0].rxnorm).toBe('5552');

    const changed = { ...rec, inn: 'edited' };
    const r2 = run([changed], [{ proposal: p, proposalHash: recordContentHash(p), reviewers }]);
    expect(r2.code).toBe(2);
    expect(r2.err).toMatch(/changed since the proposal/);
  }, 60_000);

  it('requires two distinct reviewers and refuses the shipped v0.1.0 bundle', () => {
    const p = proposal();
    const one = run(
      [rec],
      [{ proposal: p, proposalHash: recordContentHash(p), reviewers: [reviewers[0]] }],
    );
    expect(one.code).toBe(2);
    expect(one.err).toMatch(/two distinct named reviewers/);

    const shipped = run(
      [rec],
      [{ proposal: p, proposalHash: recordContentHash(p), reviewers }],
      'v0.1.0',
    );
    expect(shipped.code).toBe(1);
    expect(shipped.drugs[0].rxnorm).toBe('5552');
  }, 60_000);
});
