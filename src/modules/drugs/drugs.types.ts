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
  /** Lower / upper bounds in mL/min/1.73 m², as authored. */
  crClMinMlMin?: number;
  crClMaxMlMin?: number;
  /** Exclusive upper bound actually used for matching, set at load by
   *  normalizeDrugRecords from the drug's authoring convention. */
  crClMaxExclusive?: number;
  adjustment: string;
  /** If true, dosing in this CrCl range is contraindicated. The dosing
   *  calculator refuses to return a calculated dose and surfaces the
   *  adjustment text as a contraindication. */
  prohibited?: boolean;
  /** Qualified avoidance ("avoid where possible", "avoid unless …"): the
   *  renal rule warns, and the dosing calculator adds a warning. */
  caution?: boolean;
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
  /** True when the paediatric record carries no absolute single-dose ceiling
   *  (maxMgPerDose) — mgPerDose is a raw weight-based figure with no upper
   *  bound applied, an overdose risk at higher weights that should not be
   *  presented as fully bounded. */
  uncapped: boolean;
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

/**
 * Keys of the regulator-label sections kept as reference excerpts. PLR-format
 * prescription labels and OTC Drug Facts use different section names, so both
 * vocabularies are listed; a label carries whichever its format defines.
 */
export type LabelSectionKey =
  | 'boxedWarning'
  | 'indications'
  | 'dosageAndAdministration'
  | 'dosageFormsAndStrengths'
  | 'contraindications'
  | 'warningsAndPrecautions'
  | 'drugInteractions'
  | 'pregnancy'
  | 'lactation'
  | 'pediatricUse'
  | 'geriatricUse'
  | 'overdosage'
  | 'doNotUse'
  | 'askDoctor'
  | 'stopUse';

export interface LabelSection {
  text: string;
  /** True when the excerpt was cut at the length cap — see the full label. */
  truncated: boolean;
}

/**
 * A manufacturer's regulator-approved label (package insert), held as
 * REFERENCE ONLY next to the VedaMD drug record. It is never merged into
 * DrugRecord and always carries its jurisdiction: a US label describes US
 * products, which may differ from what is registered locally.
 *
 * Only sources whose registry verdict is `embeddable: yes` may contribute
 * section text — enforced by scripts/check-licence-compliance.js.
 */
export interface ManufacturerLabel {
  slug: string;
  inn: string;
  /** RxNorm ingredient (IN) CUIs the label was matched on. */
  rxcuiIngredients: string[];
  jurisdiction: 'US';
  /** content/sources/registry.json source id. */
  source: 'openfda';
  setId: string;
  splVersion: string;
  /** ISO date (YYYY-MM-DD) of the label version. */
  effectiveDate: string;
  manufacturer: string;
  brandNames: string[];
  applicationNumbers: string[];
  /** NDA / BLA (innovator), ANDA (generic), or other (e.g. OTC monograph). */
  applicationType: 'NDA' | 'BLA' | 'ANDA' | 'other';
  productType: string;
  routes: string[];
  sections: Partial<Record<LabelSectionKey, LabelSection>>;
  /** Other current labels for the same drug + route (DailyMed set ids). */
  alternateSetIds: string[];
  formulary: {
    atc: string[];
    kemlLevel?: number;
    whoEml?: boolean;
    awareCategory?: AwareCategory;
    /**
     * Where to verify national listing, per country (KE → moh-ke, others from
     * country-profiles.json). NOT a claim that the drug is listed there — only
     * `kemlLevel` asserts a (Kenya) listing.
     */
    nationalFormularySources: { country: string; sourceId: string }[];
  };
  citation: Citation;
  retrievedAt: string;
  reviewStatus: ReviewStatus;
}

/**
 * Link-only pointer from a VedaMD drug to a Kenya PPB SmPC PDF. No SmPC text
 * is stored — PPB has not granted reuse (registry `ppb-ke-smpc`).
 */
export interface PpbSmpcLink {
  slug: string;
  /** Display name as listed in the PPB SmPC index. */
  title: string;
  url: string;
  matchedOn: 'trade-name' | 'inn';
  confidence: 'high' | 'medium';
  /** Absent ⇒ draft (automatically matched, not yet checked by a person). */
  reviewStatus?: ReviewStatus;
}
