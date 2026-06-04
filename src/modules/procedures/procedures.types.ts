import type { Citation } from '../../common/citation';
import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Procedure guidance schema. An integrator asks "how do I perform
 * procedure X?" or "what's the safety checklist for Y?" and gets
 * back structured, citation-bearing guidance. No patient identity.
 *
 * Reuses EvidenceLevel and ReviewStatus from conditions to keep the
 * content vocabulary consistent across domains.
 */
export type ComplicationSeverity = 'minor' | 'major';

export interface ProcedureSummary {
  slug: string;
  title: string;
  domains: string[];
  cpt?: string[];
}

export interface ProcedureGuidance extends ProcedureSummary, ContentReviewMetadata {
  /** Population the guidance applies to. */
  population: {
    minAgeYears?: number;
    maxAgeYears?: number;
    sex?: 'any' | 'male' | 'female';
  };
  indications: string[];
  contraindications: {
    absolute: string[];
    relative: string[];
  };
  equipment: string[];
  /** Plain-language note on consent + counselling before the procedure. */
  consentNotes: string;
  /** Ordered step list. Each step optionally carries a safety check. */
  steps: { step: string; detail: string; safetyCheck?: string }[];
  /** Signals that should halt the procedure or escalate care. */
  redFlags: string[];
  postProcedureCare: string[];
  complications: {
    complication: string;
    severity: ComplicationSeverity;
    management: string;
  }[];
  references: Citation[];
}
