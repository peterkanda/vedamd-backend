/**
 * VedaMD condition guidance schema. Content-driven, anonymous-by-design:
 * the integrator asks "what's the management of condition X?" and gets
 * structured guidance back. We never ask who the patient is.
 *
 * Population filters (age band, pregnancy applicability, sex) are
 * optional cohort properties of the GUIDANCE, not the patient.
 */

export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'expert-consensus';

export type ReviewStatus = 'draft' | 'review' | 'approved' | 'deprecated';

export type ReviewerRole =
  | 'clinical-lead'
  | 'peer-reviewer'
  | 'governance-committee'
  | 'guideline-author';

export interface ContentReviewer {
  /** Display name or identifier of the reviewer. May be a real name, an
   *  ORCID, or a pseudonymous handle — never a patient identifier. */
  name: string;
  role: ReviewerRole;
  /** ISO-8601 timestamp of when this reviewer signed off. */
  reviewedAt: string;
}

/**
 * Shared review metadata embedded in every content record.
 * Records marked `approved` MUST carry at least two reviewers and
 * an `approvedAt` timestamp (FR-024).
 */
export interface ContentReviewMetadata {
  ruleVersion: string;
  reviewStatus: ReviewStatus;
  evidenceLevel: EvidenceLevel;
  reviewers?: ContentReviewer[];
  approvedAt?: string;
  lastReviewedAt?: string;
}

export interface ConditionSummary {
  slug: string;
  title: string;
  icd10: string[];
  domains: string[];
}

export interface ConditionGuidance extends ConditionSummary, ContentReviewMetadata {
  /** Cohort the guidance applies to. */
  population: {
    minAgeYears?: number;
    maxAgeYears?: number;
    sex?: 'any' | 'male' | 'female';
    pregnancyApplicable?: boolean;
  };
  /** Typical clinical presentation. */
  presentation: string[];
  /** Red flags that indicate escalation / referral. */
  redFlags: string[];
  /** Recommended diagnostics with a one-line rationale each. */
  diagnostics: { test: string; rationale: string }[];
  /** Ordered management steps. */
  management: { step: string; detail: string }[];
  /** Citations the integrator can show their clinician. */
  references: { label: string; url?: string }[];
}
