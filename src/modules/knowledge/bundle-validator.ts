import type { ConditionGuidance, ReviewStatus } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';

export interface ContentStats {
  totalRecords: number;
  byStatus: Record<ReviewStatus, number>;
  byDomain: Record<string, number>;
}

export type ValidationCode =
  | 'approved-without-reviewers'
  | 'approved-without-two-reviewers'
  | 'approved-without-approved-at'
  | 'unknown-review-status'
  | 'reviewer-without-name'
  | 'reviewer-without-role'
  | 'reviewer-without-timestamp';

export interface ValidationViolation {
  code: ValidationCode;
  domain: 'conditions' | 'drugs' | 'drug-interactions' | 'procedures';
  /** Slug or other identifier of the offending record. */
  recordId: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: ValidationViolation[];
  stats: ContentStats;
}

interface ReviewableRecord {
  reviewStatus: ReviewStatus;
  reviewers?: { name: string; role: string; reviewedAt: string }[];
  approvedAt?: string;
}

interface Bundle {
  conditions: ConditionGuidance[];
  drugs: DrugRecord[];
  interactions: DrugInteraction[];
  procedures: ProcedureGuidance[];
}

const KNOWN_STATUSES: readonly ReviewStatus[] = ['draft', 'review', 'approved', 'deprecated'];

/**
 * Validate every record in a loaded bundle against the FR-024 governance
 * rules:
 *   - approved records SHALL carry at least two reviewers
 *   - approved records SHALL carry an approvedAt timestamp
 *   - reviewers SHALL each have name + role + reviewedAt
 *   - reviewStatus SHALL be one of the four canonical values
 *
 * Always returns stats (totals, by status, by domain). `ok` is true iff
 * no violations.
 */
export function validateBundle(bundle: Bundle): ValidationResult {
  const violations: ValidationViolation[] = [];
  const byStatus: Record<ReviewStatus, number> = {
    draft: 0,
    review: 0,
    approved: 0,
    deprecated: 0,
  };
  const byDomain: Record<string, number> = {};

  const tally = (status: ReviewStatus, domains: string[]) => {
    if (KNOWN_STATUSES.includes(status)) byStatus[status]++;
    for (const d of domains) byDomain[d] = (byDomain[d] ?? 0) + 1;
  };

  for (const r of bundle.conditions) {
    tally(r.reviewStatus, r.domains);
    pushViolations(violations, 'conditions', r.slug, r);
  }
  for (const r of bundle.drugs) {
    tally(r.reviewStatus, [r.drugClass]);
    pushViolations(violations, 'drugs', r.slug, r);
  }
  for (const r of bundle.interactions) {
    tally(r.reviewStatus, ['drug-interactions']);
    pushViolations(violations, 'drug-interactions', `${r.slugA}::${r.slugB}`, r);
  }
  for (const r of bundle.procedures) {
    tally(r.reviewStatus, r.domains);
    pushViolations(violations, 'procedures', r.slug, r);
  }

  const totalRecords =
    bundle.conditions.length +
    bundle.drugs.length +
    bundle.interactions.length +
    bundle.procedures.length;

  return {
    ok: violations.length === 0,
    violations,
    stats: { totalRecords, byStatus, byDomain },
  };
}

function pushViolations(
  out: ValidationViolation[],
  domain: ValidationViolation['domain'],
  recordId: string,
  record: ReviewableRecord,
): void {
  if (!KNOWN_STATUSES.includes(record.reviewStatus)) {
    out.push({
      code: 'unknown-review-status',
      domain,
      recordId,
      message: `reviewStatus '${record.reviewStatus}' is not one of ${KNOWN_STATUSES.join(', ')}.`,
    });
    return;
  }

  // Reviewer-shape checks apply whenever reviewers is present.
  if (record.reviewers) {
    for (const r of record.reviewers) {
      if (!r.name) {
        out.push({ code: 'reviewer-without-name', domain, recordId, message: 'Reviewer missing name.' });
      }
      if (!r.role) {
        out.push({ code: 'reviewer-without-role', domain, recordId, message: 'Reviewer missing role.' });
      }
      if (!r.reviewedAt) {
        out.push({
          code: 'reviewer-without-timestamp',
          domain,
          recordId,
          message: 'Reviewer missing reviewedAt.',
        });
      }
    }
  }

  if (record.reviewStatus === 'approved') {
    if (!record.reviewers || record.reviewers.length === 0) {
      out.push({
        code: 'approved-without-reviewers',
        domain,
        recordId,
        message: 'Approved records require a reviewers[] array (FR-024).',
      });
    } else if (record.reviewers.length < 2) {
      out.push({
        code: 'approved-without-two-reviewers',
        domain,
        recordId,
        message: `Approved records require at least two reviewers; found ${record.reviewers.length}.`,
      });
    }
    if (!record.approvedAt) {
      out.push({
        code: 'approved-without-approved-at',
        domain,
        recordId,
        message: 'Approved records require an approvedAt timestamp.',
      });
    }
  }
}

/**
 * Filter a validation result down to records whose presence in the
 * runtime is incompatible with the configured posture. When
 * `requireApproved` is true, every draft / review / deprecated record
 * counts as a blocking violation.
 */
export function nonApprovedCount(stats: ContentStats): number {
  return stats.byStatus.draft + stats.byStatus.review + stats.byStatus.deprecated;
}
