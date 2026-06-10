import type { Citation } from '../../common/citation';
import type { Jurisdiction } from '../../common/jurisdiction';
/**
 * VedaMD condition guidance schema. Content-driven, anonymous-by-design:
 * the integrator asks "what's the management of condition X?" and gets
 * structured guidance back. We never ask who the patient is.
 *
 * Population filters (age band, pregnancy applicability, sex) are
 * optional cohort properties of the GUIDANCE, not the patient.
 */

import type { CodedReference } from '../cds/cds.types';

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
  /**
   * Country/authority this record applies to (ISO-3166 alpha-2, or 'WHO' for
   * the global baseline). Absent ⇒ Kenya (the bundle is Kenya-first). Enables
   * the multi-country base+overlay model — see src/common/jurisdiction.ts.
   */
  jurisdiction?: Jurisdiction;
}

/**
 * CDS Hooks rule declaration. Lives in the signed content bundle.
 * Each rule's `type` is the name of a strategy implemented in
 * src/modules/cds/strategies/ — the bundle declares what to fire and
 * carries the citations; the strategy code implements how to fire it.
 */
export type CdsRuleType =
  | 'drug-drug-interaction'
  | 'renal-safety'
  | 'hepatic-safety'
  | 'pregnancy-safety'
  | 'aware-stewardship'
  | 'medication-monitoring'
  | 'imci-fever-under5'
  | 'imci-diarrhoea-under5'
  | 'imci-pneumonia-under5'
  | 'imci-malaria-under5'
  | 'imci-malnutrition-under5'
  | 'imci-young-infant'
  | 'pen-hypertension-screen'
  | 'pen-diabetes-screen'
  | 'pen-cvd-risk'
  | 'paediatric-dosing'
  | 'adult-cap-crb65'
  | 'adult-acs-recognition'
  | 'adult-malaria'
  | 'anc-first-contact'
  | 'anc-preeclampsia-screen'
  | 'anc-pph-risk-screen'
  | 'tb-symptom-screen'
  | 'phq9-depression-screen'
  | 'gad7-anxiety-screen'
  | 'cage-aid-substance-screen'
  | 'mhgap-psychosis-screen'
  | 'hiv-pitc-trigger'
  | 'stroke-fast-recognition'
  | 'sepsis-qsofa'
  | 'copd-exacerbation'
  | 'anaphylaxis-recognition'
  | 'dka-recognition'
  | 'severe-asthma-exacerbation'
  | 'snake-bite-triage'
  | 'syphilis-screen'
  | 'heart-failure-decompensation'
  | 'viral-hepatitis-screen'
  | 'sti-syndromic'
  | 'gdm-screen'
  | 'status-epilepticus'
  | 'imci-measles'
  | 'pmtct'
  | 'postpartum-care'
  | 'ckd-screen'
  | 'head-injury-triage'
  | 'hhs-recognition'
  | 'tb-treatment'
  | 'rabies-pep'
  | 'neonatal-jaundice'
  | 'sickle-cell-crisis'
  | 'dengue-arboviral'
  | 'schistosomiasis-treatment'
  | 'imci-ear-infection'
  | 'neonatal-sepsis'
  | 'heat-stroke'
  /**
   * Content-only rules carry `type: null` (no bespoke strategy) — they
   * are rendered by BundleOutcomeStrategy from their `outcomes[]`, or are
   * `documentationOnly`. Arbitrary strings are tolerated for rules whose
   * declared type does not (yet) have a registered strategy; the coverage
   * test flags those unless they are documentationOnly.
   */
  | (string & {})
  | null;

export type CdsHook =
  | 'patient-view'
  | 'medication-prescribe'
  | 'order-sign'
  | 'appointment-book'
  | 'encounter-discharge';

export interface CdsRule extends ContentReviewMetadata {
  id: string;
  hook: CdsHook;
  type: CdsRuleType;
  title: string;
  description: string;
  references: Citation[];
  /**
   * Optional whitelist of CDS service IDs this rule applies to.
   * When absent the rule fires on any service matching `hook`
   * (the original aggregate behaviour). When present the rule
   * fires only on listed services — used by dedicated single-rule
   * services like `vedamd-imci-fever-under5` that should not bleed
   * into the generic `vedamd-patient-view` aggregator.
   */
  services?: string[];
  /**
   * Optional per-locale overrides for the card frame. When the
   * incoming request's `context.lang` matches a key here, the
   * strategy substitutes the localised summary/detail templates;
   * otherwise it falls back to English (the strategy's own static
   * strings).
   *
   * Templates may reference `{{key}}` placeholders that the
   * strategy fills in at evaluation time (e.g. `{{maxTempC}}`).
   * Strategies decide which keys to expose; missing keys render
   * as empty strings so a missing translation never throws.
   *
   * v0.1 ships English-only content; this field is structural
   * plumbing so adding Swahili later is a content change, not a
   * code change.
   */
  localeMessages?: Record<
    string,
    {
      summary?: string;
      detail?: string;
    }
  >;
  /**
   * Canonical coded references that apply to every card this rule
   * emits. The CdsService merges these into the card extension after
   * strategy evaluation (deduplicated against any codings the
   * strategy already attached for case-specific overrides).
   *
   * Lives in the signed content bundle so codings are versioned,
   * governed, and clinically reviewed alongside the recommendation
   * itself. Supported systems include — but are not limited to —
   * ICD-10, ICD-11 MMS, SNOMED CT, LOINC, WHO ATC, RxNorm, WHO AWaRe,
   * AMA CPT, and US NDC.
   */
  codings?: CodedReference[];
  /**
   * Self-contained card content declared directly in the bundle. When a
   * rule's `type` has no bespoke strategy registered, the generic
   * BundleOutcomeStrategy renders one CDS card per outcome straight from
   * this array — no per-rule TypeScript needed. Each outcome is already
   * cited via the rule's `references`.
   *
   * A rule that has a bespoke strategy AND outcomes would double-fire, so
   * the convention is: bespoke-strategy rules leave this empty; content-
   * only rules populate it.
   */
  outcomes?: RuleOutcome[];
  /**
   * Marks a rule as reference/documentation content that is intentionally
   * NOT meant to fire a CDS card (it has neither a strategy nor outcomes).
   * The coverage test allows these; anything else without a strategy or
   * outcomes is a bug (a "dark" rule that loads but can never surface).
   */
  documentationOnly?: boolean;
}

/**
 * A single card's worth of content declared in the bundle. Rendered
 * verbatim by BundleOutcomeStrategy when the rule has no bespoke strategy.
 */
export interface RuleOutcome {
  indicator: 'info' | 'warning' | 'critical';
  summary: string;
  detail?: string;
  /** Optional management suggestion appended to the card detail. */
  suggestion?: string;
}

export interface ConditionSummary {
  slug: string;
  title: string;
  icd10: string[];
  /** WHO ICD-11 MMS codes (optional — backfilled per bundle release). */
  icd11?: string[];
  /** SNOMED CT International disorder codes (optional). */
  snomed?: string[];
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
  references: Citation[];
}
