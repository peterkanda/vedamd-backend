import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Renal dose adjustment reference. The structured-axis counterpart to
 * the hepatic-dose domain — per eGFR band (CKD stage equivalents) plus
 * AKI considerations and dialysis dosing. Renal mis-dosing is the
 * single largest source of avoidable harm in chronic disease:
 * metformin in CKD 4 (lactic acidosis), dabigatran in CrCl <30
 * (uncontrolled bleed), gentamicin without troughs (ototoxicity, AKI),
 * gabapentinoids in dialysis (sedation, coma).
 *
 * Anonymous by design. Keyed by drug slug for direct lookup.
 */
export type EgfrBand = 'normal' | 'mild' | 'moderate' | 'severe' | 'esrd';

export interface EgfrBandGuidance {
  /**
   * eGFR band (mL/min/1.73m²): normal ≥90 · mild 60-89 · moderate 30-59
   * · severe 15-29 · esrd <15 (or on dialysis).
   */
  band: EgfrBand;
  /** "no adjustment" / "reduce by 50%" / "avoid" / etc. — verbatim from the cited source. */
  adjustment: string;
  /** Free text — monitoring, time-of-day, washout, switch-to alternative. */
  notes?: string;
}

export interface RenalDoseSummary {
  slug: string;
  drugSlug: string;
  drug: string;
  /**
   * One-line clinical headline ("Avoid in CrCl <30; halve dose at
   * CrCl 30-50 — monitor levels and signs of accumulation."). The
   * answer in 7 seconds for the clinician at the bedside.
   */
  oneLiner: string;
  /**
   * The simplest decision: is this drug safe in advanced renal
   * disease? Drives sorting and chips on the frontend.
   */
  worstClassDecision: 'use-with-caution' | 'reduce-dose' | 'avoid' | 'contraindicated';
  domains: string[];
}

export interface RenalDoseRecord extends RenalDoseSummary, ContentReviewMetadata {
  /** Mechanism — why renal disease affects this drug (renal clearance, active metabolite accumulation, nephrotoxicity, electrolyte handling). */
  mechanism: string;
  /** Per-eGFR-band adjustment guidance. Omit a band when no published recommendation exists rather than fabricate. */
  guidance: EgfrBandGuidance[];
  /** Practical monitoring — creatinine, electrolytes, drug levels (troughs), urine output. */
  monitoring?: string;
  /** Acute kidney injury (not chronic CKD) — separate considerations: held vs continued, rapidly changing GFR. */
  akiGuidance?: string;
  /** True if cleared by haemodialysis (and therefore typically needs post-dialysis re-dose or a different schedule). */
  dialyzable?: boolean;
  /** Dialysis dosing — post-HD supplement, CRRT considerations, anuria handling. */
  dialysisDoseGuidance?: string;
  /** Alternatives in advanced renal disease. */
  alternatives?: string[];
  references: { label: string; url?: string }[];
}
