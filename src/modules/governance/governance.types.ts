import type { ReviewStatus } from '../conditions/conditions.types';

export interface DomainReviewBreakdown {
  domain: string;
  total: number;
  approved: number;
  review: number;
  draft: number;
  deprecated: number;
  /** approved / total × 100, rounded to 1 dp. */
  approvedPct: number;
}

export interface Fr024Violation {
  domain: string;
  /** Record identifier (slug or id, whichever the record carries). */
  id: string;
  reason: string;
}

export interface ContentReviewReport {
  generatedAt: string;
  bundleVersion: string;
  totals: {
    records: number;
    approved: number;
    review: number;
    draft: number;
    deprecated: number;
    approvedPct: number;
  };
  byDomain: DomainReviewBreakdown[];
  /**
   * Records claiming `approved` that fail FR-024 (need ≥ 2 reviewers + an
   * approvedAt timestamp). Should always be empty for a correctly governed
   * bundle — a non-empty list is a governance bug.
   */
  fr024Violations: Fr024Violation[];
}

export interface ReviewableRecord {
  reviewStatus?: ReviewStatus;
  reviewers?: { name: string; role: string; reviewedAt: string }[];
  approvedAt?: string;
  slug?: string;
  id?: string;
}
