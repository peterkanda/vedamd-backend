import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Toxidrome reference — a recognisable cluster of vitals + exam
 * findings that points to a class of poisoning. The clinician sees a
 * presentation at the bedside, not a poison name; this module lets
 * them recognise the pattern and act before laboratory confirmation.
 *
 * Anonymous by design: every record is reference-only and never
 * touches patient identity. Each toxidrome links (where applicable) to
 * the relevant antidote slug so the integrator can chain "recognise →
 * treat" inside their EMR.
 */
export interface ToxidromeFeatures {
  /** Heart rate pattern, e.g. "tachycardia" / "bradycardia" / "variable". */
  heartRate?: string;
  /** Blood pressure pattern. */
  bloodPressure?: string;
  /** Respiratory rate / pattern (depth, Kussmaul, etc.). */
  respiratoryRate?: string;
  /** Temperature, e.g. "hyperthermia" / "normothermia" / "hypothermia". */
  temperature?: string;
  /** Pupil findings, e.g. "miosis (pinpoint)" / "mydriasis (dilated)". */
  pupils?: string;
  /** Skin findings: diaphoresis, dry, flushed, cyanotic. */
  skin?: string;
  /** Mental status: agitation, somnolence, coma, hyperalert. */
  mentalStatus?: string;
  /** Bowel sounds: hyperactive, hypoactive, absent. */
  bowelSounds?: string;
  /** Other distinguishing features (clonus, fasciculations, seizures, etc.). */
  other?: string[];
}

export interface ToxidromeSummary {
  slug: string;
  /** Human-readable toxidrome name. */
  name: string;
  /** One-line pattern recognition headline. */
  oneLiner: string;
  domains: string[];
  /** Slug of the linked antidote record where a specific antidote exists. */
  antidoteSlug?: string | null;
}

export interface Toxidrome extends ToxidromeSummary, ContentReviewMetadata {
  /** Cluster of vital signs + exam findings. */
  features: ToxidromeFeatures;
  /** Common causative agents / drug classes that produce this pattern. */
  causativeAgents: string[];
  /**
   * Conditions that mimic this toxidrome and must be ruled out (the
   * 3-a.m. trap: serotonin syndrome looks like NMS, anticholinergic
   * looks like sympathomimetic, hypoglycaemia looks like everything).
   */
  differentialDiagnosis: string[];
  /**
   * Immediate management — ordered actions the clinician can take
   * before specialty advice arrives. Plain prose; the deterministic
   * engine does NOT auto-prescribe from this field.
   */
  management: string[];
  /** Free-text antidote / specific reversal guidance (mirrors the linked antidote record). */
  antidote?: string;
  /** Red flags that escalate to immediate ICU / specialist input. */
  redFlags: string[];
  references: { label: string; url?: string }[];
}
