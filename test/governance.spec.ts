import { describe, expect, it } from 'vitest';
import { GovernanceService } from '../src/modules/governance/governance.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): GovernanceService {
  return new GovernanceService(makeKnowledgeService());
}

describe('GovernanceService — content review report', () => {
  it('produces a per-domain review-status breakdown over the real bundle', () => {
    const report = makeService().report();
    expect(report.totals.records).toBeGreaterThan(5000);
    expect(report.byDomain.length).toBeGreaterThan(15);
    // The biggest domain (conditions) should be first after the sort.
    expect(report.byDomain[0].total).toBeGreaterThanOrEqual(report.byDomain[1].total);
    for (const d of report.byDomain) {
      expect(d.approved + d.review + d.draft + d.deprecated).toBe(d.total);
    }
  });

  it('totals reconcile with the per-domain sums', () => {
    const report = makeService().report();
    const summed = report.byDomain.reduce(
      (acc, d) => {
        acc.records += d.total;
        acc.approved += d.approved;
        acc.review += d.review;
        acc.draft += d.draft;
        acc.deprecated += d.deprecated;
        return acc;
      },
      { records: 0, approved: 0, review: 0, draft: 0, deprecated: 0 },
    );
    expect(summed.records).toBe(report.totals.records);
    expect(summed.approved).toBe(report.totals.approved);
    expect(summed.draft).toBe(report.totals.draft);
  });

  it('reports zero FR-024 violations for the dev bundle (no fake approvals)', () => {
    // The dev bundle is all-draft; the validator + sign pipeline forbid an
    // approved record without ≥ 2 reviewers + approvedAt, so the live report
    // must surface no violations.
    const report = makeService().report();
    expect(report.fr024Violations).toEqual([]);
  });

  it('flags an approved record that violates FR-024', () => {
    // Synthetic record exercising the FR-024 check directly.
    const svc = makeService() as unknown as {
      checkFr024: (d: string, r: unknown) => unknown;
    };
    const ok = svc.checkFr024('conditions', {
      slug: 'x',
      reviewStatus: 'approved',
      reviewers: [
        { name: 'A', role: 'clinical-lead', reviewedAt: '2026-01-01' },
        { name: 'B', role: 'peer-reviewer', reviewedAt: '2026-01-02' },
      ],
      approvedAt: '2026-01-03',
    });
    expect(ok).toBeNull();
    const bad = svc.checkFr024('conditions', {
      slug: 'y',
      reviewStatus: 'approved',
      reviewers: [{ name: 'A', role: 'clinical-lead', reviewedAt: '2026-01-01' }],
    });
    expect(bad).not.toBeNull();
  });
});
