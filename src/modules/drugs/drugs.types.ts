import type { Citation } from '../../common/citation';
/**
 * VedaMD drug record schema. Slug is the API primary key; RxNorm,
 * ATC, INN are searchable secondary identifiers. The schema is
 * deliberately non-FHIR — content is content, not Medication resources.
 */

import type {
  ContentReviewMetadata,
  EvidenceLevel,
  ReviewStatus,
} from '../conditions/conditions.types';

export type AwareCategory = 'Access' | 'Watch' | 'Reserve' | 'Not-classified';
export type AdverseEffectFrequency = 'common' | 'uncommon' | 'rare' | 'serious';
export type InteractionSeverity = 'contraindicated' | 'severe' | 'major' | 'moderate' | 'minor';

export type { EvidenceLevel, ReviewStatus };

export interface PaediatricDosing {
  /** Standard mg/kg/dose. */
  mgPerKgPerDose?: number;
  /** Per-day cap when summed across doses. */
  maxMgPerKgPerDay?: number;
  /** Absolute single-dose ceiling (typically the adult dose). */
  maxMgPerDose?: number;
  /** Minimum weight below which a different protocol applies. */
  minWeightKg?: number;
  route: string;
  frequency: string;
  notes?: string;
}

export interface RenalAdjustment {
  /** Inclusive lower / upper bounds in mL/min/1.73 m². */
  crClMinMlMin?: number;
  crClMaxMlMin?: number;
  adjustment: string;
  /** If true, dosing in this CrCl range is contraindicated. The dosing
   *  calculator refuses to return a calculated dose and surfaces the
   *  adjustment text as a contraindication. */
  prohibited?: boolean;
}

export interface DrugSummary {
  slug: string;
  inn: string;
  tradeNames: string[];
  atc: string[];
  awareCategory?: AwareCategory;
  kemlLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  drugClass: string;
}

export interface DrugRecord extends DrugSummary, ContentReviewMetadata {
  rxnorm?: string;
  /**
   * SNOMED CT International substance / product code (optional).
   * Lets EHRs map the VedaMD drug record to their local pharmacy
   * dictionary without text-matching on `inn`.
   */
  snomed?: string;
  whoEml: boolean;
  indications: { icd10?: string; text: string }[];
  mechanism: string;
  pharmacokinetics: {
    halfLifeHours?: number;
    metabolism?: string;
    excretion?: string;
    notes?: string;
  };
  dosing: {
    adult: { route: string; regimen: string; notes?: string }[];
    paediatric?: PaediatricDosing;
    renal?: RenalAdjustment[];
    hepatic?: string;
    /** True for drugs whose dosing must be individualised (e.g. INR-titrated
     *  warfarin). The calculator returns narrative-only, no calculated mg. */
    individualised?: boolean;
  };
  pregnancy: {
    category?: string;
    notes: string;
    /** Structured flag the pregnancy-safety rule reads. True when
     *  the drug is broadly contraindicated in pregnancy (any trimester);
     *  narrative-only nuance (e.g. "first trimester only") stays in notes. */
    contraindicated?: boolean;
  };
  lactation: string;
  contraindications: string[];
  warnings: string[];
  adverseEffects: { frequency: AdverseEffectFrequency; effect: string }[];
  monitoring: string[];
  references: Citation[];
}

export interface DosingInput {
  weightKg: number;
  ageYears?: number;
  /** Free text — surfaced in the narrative when relevant (e.g. "otitis media"). */
  indication?: string;
  /** Estimated creatinine clearance, mL/min/1.73 m². */
  crClMlMin?: number;
  /** Preferred route. Defaults to the first adult regimen's route or 'oral'. */
  route?: string;
}

export type DosingProtocol =
  | 'adult'
  | 'paediatric'
  | 'weight-banded'
  | 'individualised'
  | 'not-applicable';

export interface CalculatedDose {
  mgPerDose: number;
  route: string;
  frequency: string;
  maxMgPerDay?: number;
  /** Human-readable list of any safety caps that bound the calculated dose. */
  capsApplied: string[];
}

export interface DosingResult {
  slug: string;
  inputs: DosingInput;
  protocol: DosingProtocol;
  calculatedDose?: CalculatedDose;
  /** Human-readable explanation. Always populated. */
  narrative: string;
  warnings: string[];
  contraindications: string[];
  references: Citation[];
  ruleVersion: string;
  evidenceLevel: EvidenceLevel;
  reviewStatus: ReviewStatus;
}

export interface DrugInteraction extends ContentReviewMetadata {
  slugA: string;
  slugB: string;
  severity: InteractionSeverity;
  mechanism: string;
  management: string;
  references: Citation[];
}
