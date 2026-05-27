import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * IV compatibility reference — Y-site / syringe / additive compatibility
 * for inpatient IV medication co-administration. Wrong co-infusion can
 * precipitate visible particulate → line occlusion, embolism, or in the
 * extreme case (ceftriaxone + calcium in neonates) crystalline deposits
 * in the lungs and kidneys causing death.
 *
 * This is a curated subset, NOT a Trissel's replacement. We cover the
 * highest-mortality and most frequently asked inpatient pairs, drawing
 * on King Guide, ASHP, FDA labelling, and primary literature. Where the
 * answer is genuinely unknown for a pair, we say so — silence is safer
 * than a guessed "compatible". Verify against local pharmacy guidance
 * for any unlisted pair.
 *
 * Anonymous by design: reference content only, never patient data.
 */
export type IvCompatibilityStatus =
  /** Documented compatible at typical clinical concentrations via Y-site, additive or syringe (per cited source). */
  | 'compatible'
  /**
   * Compatibility is concentration-, time-, diluent- or temperature-dependent.
   * Specifics described in `notes`. Treat as caution; verify before use.
   */
  | 'conditional'
  /** Documented incompatible — visible precipitate, colour change, gas evolution, or loss of potency. Do NOT co-administer. */
  | 'incompatible'
  /** No reliable data; cannot infer safety. Treat as incompatible unless the local pharmacy confirms. */
  | 'no-data';

export interface IvCompatibilitySummary {
  slug: string;
  drugA: string;
  drugASlug?: string | null;
  drugB: string;
  drugBSlug?: string | null;
  status: IvCompatibilityStatus;
  /** One-line headline ("DEATHS reported in neonates: ceftriaxone + Ca → crystalline emboli — separate lines, ≥ 48 h between"). */
  oneLiner: string;
  domains: string[];
}

export interface IvCompatibility extends IvCompatibilitySummary, ContentReviewMetadata {
  /**
   * Route of administration this entry applies to: y-site, additive
   * (mixed in same bag), syringe (drawn in same syringe), or all.
   */
  routeContext: Array<'y-site' | 'additive' | 'syringe' | 'all'>;
  /**
   * Free text describing concentration ranges, diluents, observation
   * findings (precipitate, colour change, loss of potency, etc.) and
   * any specific cautions (the verbatim cited finding — do not paraphrase
   * numbers).
   */
  notes: string;
  /** Practical alternative — what to do instead when the pair is incompatible. */
  alternative?: string;
  references: { label: string; url?: string }[];
}
