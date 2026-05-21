import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open catalogue of validated clinical scoring tools (CHA2DS2-VASc,
 * Wells, NEWS2, GCS, etc.). Reference content only — anonymous by
 * design, no patient identity. Lives in the signed bundle alongside the
 * other content domains.
 */
export interface ScoreItem {
  /** Criterion description, including how points are assigned. */
  label: string;
  /** Points contributed (max for the criterion). Some tools are formula- or
   *  rule-based rather than additive; see `scoring.method`. */
  points: number;
}

export interface ScoreInterpretationBand {
  /** Score range or condition (e.g. "≥2", "0–1", "All 8 met"). */
  band: string;
  /** Clinical meaning of the band. */
  meaning: string;
  /** Suggested action, where applicable. */
  action?: string;
}

export interface ClinicalScoreSummary {
  slug: string;
  title: string;
  abbrev?: string;
  domains: string[];
}

export interface ClinicalScore extends ClinicalScoreSummary, ContentReviewMetadata {
  purpose: string;
  population?: { notes?: string };
  items: ScoreItem[];
  scoring: {
    /** sum | weighted-sum | formula | any-criterion | all-criteria-met */
    method: string;
    min?: number;
    max?: number;
    notes?: string;
  };
  interpretation: ScoreInterpretationBand[];
  caution?: string;
  references: { label: string; url?: string }[];
}
