import type { Citation } from '../../common/citation';
import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Symptom-triage / differential-diagnosis reference. All existing
 * VedaMD rules are forward-chaining (patient context → recommendation);
 * the most common clinician question, however, is backward — "what
 * could this be?". This module gives the clinician an ordered DDx for
 * a chief complaint plus the must-not-miss diagnoses and red flags.
 *
 * Each record is a chief complaint keyed by slug, with ranked
 * differential bands so the clinician sees both common-and-likely AND
 * rare-but-deadly side-by-side. Anonymous by design — reference only.
 *
 * NOT a substitute for clinical judgement. Use alongside Isabel,
 * VisualDx, or the local senior on call for atypical presentations.
 */
export type DdxLikelihood =
  /** Common; first considerations. */
  | 'common'
  /** Less common but well-recognised; should be on the list. */
  | 'consider'
  /** Rare but DEADLY — must rule out before discharge. */
  | 'must-not-miss';

export interface DifferentialEntry {
  diagnosis: string;
  /** Linked condition slug, when one exists in the VedaMD bundle. */
  conditionSlug?: string | null;
  likelihood: DdxLikelihood;
  /** Distinguishing features that point to or away from this diagnosis. */
  pointers?: string;
  /** Discriminating investigations. */
  investigation?: string;
}

export interface SymptomTriageSummary {
  slug: string;
  chiefComplaint: string;
  /** One-line clinical framing ("Adult chest pain — three killer DDx (ACS, PE, aortic dissection) must be ruled out before discharge."). */
  oneLiner: string;
  domains: string[];
  /**
   * Whether the chief complaint is typically adult, paediatric, or both.
   * Helps the integrator scope filtering.
   */
  populationScope: 'adult' | 'paediatric' | 'all-ages';
}

export interface SymptomTriageRecord extends SymptomTriageSummary, ContentReviewMetadata {
  /** Brief framing: epidemiology, who presents, when to worry. */
  framing: string;
  /** Targeted history questions that change the differential. */
  keyHistory: string[];
  /** Focused examination points. */
  keyExam: string[];
  /** Differential diagnoses, ranked into bands. */
  differential: DifferentialEntry[];
  /** Red flags — clinical features that mandate urgent escalation regardless of differential. */
  redFlags: string[];
  /** First-line investigations applicable to most presentations. */
  initialInvestigations: string[];
  /** Disposition decision aid — when to admit, when to discharge, what safety-net advice. */
  disposition: string;
  references: Citation[];
}
