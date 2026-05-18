/**
 * VedaMD drug record schema. Slug is the API primary key; RxNorm,
 * ATC, INN are searchable secondary identifiers. The schema is
 * deliberately non-FHIR — content is content, not Medication resources.
 */

export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'expert-consensus';
export type ReviewStatus = 'draft' | 'reviewed' | 'approved';
export type AwareCategory = 'Access' | 'Watch' | 'Reserve' | 'Not-classified';
export type AdverseEffectFrequency = 'common' | 'uncommon' | 'rare' | 'serious';
export type InteractionSeverity = 'severe' | 'major' | 'moderate' | 'minor';

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

export interface DrugRecord extends DrugSummary {
  rxnorm?: string;
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
  };
  pregnancy: { category?: string; notes: string };
  lactation: string;
  contraindications: string[];
  warnings: string[];
  adverseEffects: { frequency: AdverseEffectFrequency; effect: string }[];
  monitoring: string[];
  references: { label: string; url?: string }[];
  ruleVersion: string;
  reviewStatus: ReviewStatus;
  evidenceLevel: EvidenceLevel;
  lastReviewedAt?: string;
}

export interface DrugInteraction {
  slugA: string;
  slugB: string;
  severity: InteractionSeverity;
  mechanism: string;
  management: string;
  references: { label: string; url?: string }[];
  ruleVersion: string;
  reviewStatus: ReviewStatus;
  evidenceLevel: EvidenceLevel;
}
