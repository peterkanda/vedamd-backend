import { describe, expect, it } from 'vitest';
import { nonApprovedCount, validateBundle } from '../src/modules/knowledge/bundle-validator';

function emptyBundle() {
  return { conditions: [], drugs: [], interactions: [], procedures: [] };
}

function approvedCondition(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'sample',
    title: 'Sample condition',
    icd10: ['X00'],
    domains: ['test'],
    population: {},
    presentation: [],
    redFlags: [],
    diagnostics: [],
    management: [],
    references: [],
    ruleVersion: '1.0.0',
    reviewStatus: 'approved' as const,
    evidenceLevel: 'A' as const,
    reviewers: [
      { name: 'Dr A', role: 'clinical-lead' as const, reviewedAt: '2026-01-01T00:00:00Z' },
      { name: 'Dr B', role: 'peer-reviewer' as const, reviewedAt: '2026-01-02T00:00:00Z' },
    ],
    approvedAt: '2026-01-03T00:00:00Z',
    ...overrides,
  };
}

describe('validateBundle', () => {
  it('accepts an empty bundle and reports zero counts', () => {
    const r = validateBundle(emptyBundle());
    expect(r.ok).toBe(true);
    expect(r.stats.totalRecords).toBe(0);
    expect(r.stats.byStatus.approved).toBe(0);
    expect(r.stats.byStatus.draft).toBe(0);
  });

  it('accepts an approved record with two reviewers and approvedAt', () => {
    const r = validateBundle({ ...emptyBundle(), conditions: [approvedCondition() as never] });
    expect(r.ok).toBe(true);
    expect(r.stats.byStatus.approved).toBe(1);
  });

  it('rejects an approved record with fewer than two reviewers', () => {
    const c = approvedCondition({
      reviewers: [{ name: 'Dr A', role: 'clinical-lead', reviewedAt: '2026-01-01' }],
    });
    const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === 'approved-without-two-reviewers')).toBe(true);
  });

  it('rejects an approved record with no reviewers at all', () => {
    const c = approvedCondition({ reviewers: undefined });
    const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === 'approved-without-reviewers')).toBe(true);
  });

  it('rejects an approved record missing approvedAt', () => {
    const c = approvedCondition({ approvedAt: undefined });
    const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === 'approved-without-approved-at')).toBe(true);
  });

  it('does NOT require reviewers on draft / review / deprecated records', () => {
    for (const status of ['draft', 'review', 'deprecated'] as const) {
      const c = approvedCondition({
        reviewStatus: status,
        reviewers: undefined,
        approvedAt: undefined,
      });
      const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
      expect(r.ok).toBe(true);
    }
  });

  it('flags an unknown reviewStatus value', () => {
    const c = approvedCondition({ reviewStatus: 'pending' as never });
    const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
    expect(r.ok).toBe(false);
    expect(r.violations[0].code).toBe('unknown-review-status');
  });

  it('flags reviewer entries missing name / role / timestamp', () => {
    const c = approvedCondition({
      reviewers: [
        { name: '', role: '' as never, reviewedAt: '' },
        { name: 'Dr B', role: 'peer-reviewer', reviewedAt: '2026-01-02' },
      ],
    });
    const r = validateBundle({ ...emptyBundle(), conditions: [c as never] });
    expect(r.violations.map((v) => v.code).sort()).toEqual([
      'reviewer-without-name',
      'reviewer-without-role',
      'reviewer-without-timestamp',
    ]);
  });

  it('tallies the v0.1 dev bundle as all-draft', () => {
    // Eagerly load the real bundle and validate it.

    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');

    const dir = path.resolve(process.cwd(), 'content/bundles/v0.1.0');
    const read = (n: string) => JSON.parse(fs.readFileSync(path.resolve(dir, n), 'utf8'));
    const r = validateBundle({
      conditions: read('conditions.json'),
      drugs: read('drugs.json'),
      interactions: read('drug-interactions.json'),
      procedures: read('procedures.json'),
    });
    expect(r.ok).toBe(true);
    expect(r.stats.byStatus.approved).toBe(0);
    expect(r.stats.byStatus.draft).toBeGreaterThan(0);
    expect(nonApprovedCount(r.stats)).toBe(r.stats.totalRecords);
  });
});
