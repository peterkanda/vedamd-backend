import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Pregnancy & Lactation reference in the 2015 FDA PLLR (Pregnancy and
 * Lactation Labeling Rule) structured-narrative format. PLLR retired
 * the A/B/C/D/X letter categories — they oversimplified risk and led
 * to false reassurance ("category B sounds fine, doesn't it?") that
 * cost lives. Our drug records still carry the legacy letter for
 * back-compat, but THIS module is the source of truth: a clinician
 * looking after a pregnant or lactating patient gets the structured
 * narrative, not a letter.
 *
 * Anonymous by design — every record is reference-only. Keyed by drug
 * slug so an integrator can chain "drug prescribed → PLLR detail".
 *
 * Structure follows 21 CFR 201.57(c)(9) (PLLR final rule):
 *   - Pregnancy: risk summary, clinical considerations, data
 *   - Lactation: risk summary, clinical considerations, data
 *     (LactMed-style — drug in milk, infant exposure, alternatives)
 *   - Females and males of reproductive potential: pregnancy testing,
 *     contraception, infertility
 */
export interface PregnancyNarrative {
  /**
   * Brief, prominent risk summary (the bottom line — what to tell
   * the patient). PLLR mandates this be at the top, before any data
   * detail, because a busy clinician reads the first paragraph only.
   */
  riskSummary: string;
  /**
   * Clinical considerations: disease-associated maternal/embryo-fetal
   * risk; dose adjustments during pregnancy; maternal adverse reactions;
   * fetal/neonatal adverse reactions; labor and delivery considerations.
   */
  clinicalConsiderations?: string;
  /**
   * Data: human, animal — verbatim from the cited source. Includes
   * trimester-specific findings, registry data, and meta-analysis results.
   */
  data?: string;
  /**
   * Trimester-specific guidance, ordered. Use sparingly — most drugs
   * do not have clear trimester-cut decisions; over-prescribing
   * trimester rules leads to nocebo / undertreatment.
   */
  trimesterNotes?: { trimester: '1' | '2' | '3' | 'all'; note: string }[];
}

export interface LactationNarrative {
  /** Bottom line for the breastfeeding patient. */
  riskSummary: string;
  /** Clinical considerations including monitoring of the breastfed infant. */
  clinicalConsiderations?: string;
  /**
   * Detailed pharmacokinetic data: relative infant dose (RID), milk:plasma
   * ratio, infant plasma levels reported, observed adverse effects.
   * LactMed-style detail.
   */
  data?: string;
  /** Preferred alternative agents within the same therapeutic class, if applicable. */
  alternatives?: string[];
}

export interface ReproductiveNarrative {
  pregnancyTesting?: string;
  contraception?: string;
  infertility?: string;
}

export interface PregnancyLactationSummary {
  slug: string;
  drugSlug: string;
  drug: string;
  /**
   * One-line clinical headline ("Paracetamol is the analgesic of choice
   * across all trimesters and during lactation."). The clinician's
   * answer in 7 seconds.
   */
  oneLiner: string;
  /**
   * Pregnancy compatibility tier — derived from the narrative, NOT a
   * substitute for it. Reproduces the question clinicians ask: "Can I
   * safely give this?".
   */
  pregnancyCompatibility: 'preferred' | 'acceptable' | 'caution' | 'avoid' | 'contraindicated';
  /** Same idea for lactation. */
  lactationCompatibility: 'preferred' | 'acceptable' | 'caution' | 'avoid' | 'contraindicated';
  domains: string[];
  /**
   * Legacy FDA pregnancy category (A | B | C | D | X) if previously
   * assigned — for back-compat reference only. PLLR replaced this in
   * 2015; do not use as the primary decision aid.
   */
  legacyFdaCategory?: 'A' | 'B' | 'C' | 'D' | 'X';
}

export interface PregnancyLactationRecord
  extends PregnancyLactationSummary,
    ContentReviewMetadata {
  pregnancy: PregnancyNarrative;
  lactation: LactationNarrative;
  reproductive?: ReproductiveNarrative;
  references: { label: string; url?: string }[];
}
