import type { ReviewStatus } from '../conditions/conditions.types';
import type { CorrectionProposal } from './corrections';

export type ReviewDecision = 'approve' | 'request-changes';

/**
 * Where a record stands in the review workflow, computed from the decisions
 * on its CURRENT content hash (decisions on older content are ignored).
 */
export type ReviewState =
  | 'needs-review'
  | 'needs-second-review'
  | 'changes-requested'
  | 'ready-to-promote';

export interface ReviewFlags {
  /** Drug record whose RxNorm code is quarantined — approval refused until fixed. */
  quarantinedCode: boolean;
  /** States a per-kg dose with no maximum — reviewer must confirm or add a ceiling. */
  uncappedPerKgDose: boolean;
  /** Citations without a URL a clinician could open. */
  citationsWithoutUrl: number;
  /** Only graded citations are D-tier (or none) — approval refused (same rule as promote-bundle). */
  soleDTierCitations: boolean;
}

export interface ReviewQueueItem {
  /** Bundle file domain, e.g. "drugs", "drug-disease-interactions". */
  domain: string;
  /** slug, else id (cds-rules), else "a+b" for a drug-interaction pair — see recordKey(). */
  recordId: string;
  title: string;
  tier: 1 | 2 | 3;
  kemlLevel?: number;
  reviewStatus: ReviewStatus;
  recordHash: string;
  state: ReviewState;
  /** Distinct reviewers whose latest decision on this content is approve (dev-bypass excluded). */
  approvals: number;
  flags: ReviewFlags;
  /** Why approval would be refused right now; empty when approvable. */
  approvalBlockers: string[];
}

export interface ReviewQueuePage {
  bundleVersion: string;
  total: number;
  counts: Record<ReviewState, number>;
  items: ReviewQueueItem[];
}

export interface ReviewDecisionRecord {
  id: string;
  bundleVersion: string;
  domain: string;
  recordId: string;
  recordHash: string;
  decision: ReviewDecision;
  reviewerSub: string;
  reviewerName: string;
  reviewerRole: string;
  integratorId?: string | null;
  viaDevBypass: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface ReviewPacket extends ReviewQueueItem {
  record: unknown;
  /** Every decision on this record, newest first, including stale ones. */
  decisions: Array<ReviewDecisionRecord & { stale: boolean }>;
}

export interface SubmitReviewDto {
  domain: string;
  recordId: string;
  /** The hash from the queue/packet the reviewer read — guards against reviewing stale content. */
  recordHash: string;
  decision: ReviewDecision;
  /** Clinical role the reviewer attests to, e.g. "Consultant Physician". */
  role: string;
  /** Required when requesting changes. */
  notes?: string;
}

/** Input for scripts/promote-bundle.ts --from-decisions. */
export interface ApprovalExport {
  bundleVersion: string;
  generatedAt: string;
  approvals: Array<{
    domain: string;
    recordId: string;
    recordHash: string;
    reviewers: Array<{ name: string; role: string; reviewedAt: string }>;
  }>;
  /**
   * Approved correction proposals — input to
   * `npm run corrections:apply -- --from-decisions <file>`, run BEFORE
   * bundle:promote (a correction changes the record, so it returns to draft).
   */
  corrections: Array<{
    proposal: CorrectionProposal;
    proposalHash: string;
    reviewers: Array<{ name: string; role: string; reviewedAt: string }>;
  }>;
}
