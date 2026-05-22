import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open WHO EPI routine immunization schedule. Reference content only,
 * anonymous by design — the integrator asks "what's the schedule for
 * vaccine X / against disease Y?" and gets dose timings and notes.
 */
export interface VaccineDose {
  /** Dose label (e.g. "Birth dose", "Dose 1–3", "MCV1"). */
  dose: string;
  /** When the dose is given (e.g. "6, 10 and 14 weeks"). */
  timing: string;
  route?: string;
  notes?: string;
}

export interface ImmunizationSummary {
  slug: string;
  vaccine: string;
  abbrev?: string | null;
  /** Slug of the related drug/vaccine record, when one exists. */
  vaccineDrugSlug?: string | null;
  targetDisease: string[];
  domains: string[];
}

export interface ImmunizationScheduleEntry extends ImmunizationSummary, ContentReviewMetadata {
  doses: VaccineDose[];
  population?: { minAgeYears?: number; sex?: string; notes?: string };
  catchUp?: string | null;
  notes?: string | null;
  references: { label: string; url?: string }[];
}
