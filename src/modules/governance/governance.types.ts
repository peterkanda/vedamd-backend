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

export type ReadinessStatus = 'pass' | 'warn' | 'block';

export interface ReadinessCheck {
  id:
    | 'content-approval'
    | 'fr024'
    | 'approved-only-mode'
    | 'drug-codes'
    | 'citation-urls'
    | 'per-kg-ceilings'
    | 'country-overlays'
    | 'manufacturer-labels'
    | 'corrections';
  title: string;
  status: ReadinessStatus;
  /** One-line measurement, e.g. "0 of 7,651 records approved (0%)". */
  summary: string;
  /** What to do next, and where the worklist lives. */
  action?: string;
  metrics: Record<string, number>;
}

/**
 * Release-readiness of the signed bundle for approved-only serving.
 * `releaseReady` is true only when no check blocks.
 */
export interface ReadinessReport {
  generatedAt: string;
  bundleVersion: string;
  releaseReady: boolean;
  checks: ReadinessCheck[];
  /** Summaries of the blocking checks, in check order. */
  blockers: string[];
  /** Per-domain approval, highest clinical risk first. */
  domains: Array<DomainReviewBreakdown & { tier: 1 | 2 | 3 }>;
}
