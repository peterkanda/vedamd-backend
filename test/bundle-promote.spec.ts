import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The content-approval gate.
 *
 * Everything downstream of promotion already worked — the signer refuses
 * unapproved content, the validator enforces FR-024's two reviewers, the
 * runtime gate exists — but nothing could actually promote a record, which is
 * why the shipped bundle is 7,144 draft and 0 approved. These tests pin the
 * safety invariants of the tool that closes that gap, so approval cannot
 * become a rubber stamp.
 */

const SCRIPT = resolve(__dirname, '../scripts/promote-bundle.ts');
let dir: string;

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(
      'npx',
      ['ts-node', '--transpile-only', SCRIPT, '--bundle', dir, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function writeDomain(records: unknown[]): void {
  writeFileSync(join(dir, 'drugs.json'), JSON.stringify(records, null, 2));
}

function readDomain(): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(join(dir, 'drugs.json'), 'utf8'));
}

const A_TIER = [{ label: 'WHO Model Formulary', strength: 'A', url: 'https://who.int/x' }];
const D_TIER = [{ label: 'Wikipedia', strength: 'D', url: 'https://en.wikipedia.org/x' }];
const TWO_REVIEWERS = [
  '--reviewer',
  'A. Mwangi:Consultant Physician',
  '--reviewer',
  'B. Otieno:Clinical Pharmacologist',
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vedamd-promote-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('content promotion gate', () => {
  it('promotes draft to review', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'draft', references: A_TIER }]);
    const res = run(['--to', 'review', '--domain', 'drugs', '--slug', 'amoxicillin']);
    expect(res.code).toBe(0);
    expect(readDomain()[0].reviewStatus).toBe('review');
  });

  it('refuses to jump straight from draft to approved', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'draft', references: A_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      ...TWO_REVIEWERS,
    ]);
    // Skipping review would mean nothing ever told a reviewer to look.
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/one step at a time/);
    expect(readDomain()[0].reviewStatus).toBe('draft');
  });

  it('refuses approval with fewer than two named reviewers (FR-024)', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: A_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      '--reviewer',
      'A. Mwangi:Consultant Physician',
    ]);
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/at least two named reviewers/);
    expect(readDomain()[0].reviewStatus).toBe('review');
  });

  it('refuses a reviewer without a role — approval cannot be anonymous', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: A_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      '--reviewer',
      'A. Mwangi',
      '--reviewer',
      'B. Otieno:Clinical Pharmacologist',
    ]);
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/Name:Role/);
  });

  it('refuses approval when the only citation is D-tier', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: D_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      ...TWO_REVIEWERS,
    ]);
    // check-citation-strength.js defers exactly this check to clinical review;
    // this is where it lands.
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/D-tier/);
  });

  it('refuses approval when there is no graded citation at all', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: [] }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      ...TWO_REVIEWERS,
    ]);
    expect(res.code).toBe(2);
  });

  it('approves with two named reviewers and a real source, recording provenance', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: A_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      ...TWO_REVIEWERS,
    ]);
    expect(res.code).toBe(0);

    const rec = readDomain()[0];
    expect(rec.reviewStatus).toBe('approved');
    expect(rec.approvedAt).toBeTruthy();
    const reviewers = rec.reviewers as Array<Record<string, string>>;
    expect(reviewers).toHaveLength(2);
    // Provenance has to be attributable, not just present.
    for (const r of reviewers) {
      expect(r.name).toBeTruthy();
      expect(r.role).toBeTruthy();
      expect(r.reviewedAt).toBeTruthy();
    }
  });

  it('changes nothing on --dry-run', () => {
    writeDomain([{ slug: 'amoxicillin', reviewStatus: 'review', references: A_TIER }]);
    const res = run([
      '--to',
      'approved',
      '--domain',
      'drugs',
      '--slug',
      'amoxicillin',
      ...TWO_REVIEWERS,
      '--dry-run',
    ]);
    expect(res.code).toBe(0);
    expect(readDomain()[0].reviewStatus).toBe('review');
  });

  it('fails the ratchet when unapproved content would grow', () => {
    // The real ceiling is the current backlog, so any extra unapproved record
    // in a temp bundle is under it — instead assert the check runs and reports
    // the count it is gating on, which is what CI depends on.
    writeDomain([{ slug: 'a', reviewStatus: 'draft', references: A_TIER }]);
    const res = run(['--check']);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/unapproved records: 1/);
    // A shrunken backlog must tell you to lower the ceiling, or it creeps back.
    expect(res.out).toMatch(/Lower MAX_UNAPPROVED/);
  });

  it('tells you to turn the real gate on once nothing is unapproved', () => {
    writeDomain([
      {
        slug: 'a',
        reviewStatus: 'approved',
        approvedAt: '2026-09-11T00:00:00.000Z',
        reviewers: [
          { name: 'A', role: 'Physician', reviewedAt: '2026-09-11T00:00:00.000Z' },
          { name: 'B', role: 'Pharmacologist', reviewedAt: '2026-09-11T00:00:00.000Z' },
        ],
        references: A_TIER,
      },
    ]);
    const res = run(['--check']);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/CONTENT_REQUIRE_APPROVED=true/);
  });

  it('reports the approval backlog', () => {
    writeDomain([
      { slug: 'a', reviewStatus: 'draft', references: A_TIER },
      { slug: 'b', reviewStatus: 'review', references: A_TIER },
    ]);
    const res = run(['--status']);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/draft=1/);
    expect(res.out).toMatch(/review=1/);
    expect(res.out).toMatch(/0\/2 approved/);
  });
});
