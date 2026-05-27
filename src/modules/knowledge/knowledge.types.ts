import type { CdsRule, ConditionGuidance } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';
import type { ClinicalScore } from '../clinical-scores/clinical-scores.types';
import type { PgxGuideline } from '../pharmacogenomics/pharmacogenomics.types';
import type { DrugDiseaseInteraction } from '../drug-disease/drug-disease.types';
import type { ImmunizationScheduleEntry } from '../immunization/immunization.types';
import type { AllergyCrossReactivity } from '../allergy/allergy.types';
import type { NotifiableDisease } from '../notifiable/notifiable.types';
import type { ReferenceRange } from '../reference-ranges/reference-ranges.types';
import type { Antidote } from '../antidotes/antidotes.types';
import type { Toxidrome } from '../toxidromes/toxidromes.types';
import type { AnticoagulantReversal } from '../anticoagulant-reversal/anticoagulant-reversal.types';
import type { IvCompatibility } from '../iv-compatibility/iv-compatibility.types';
import type { PregnancyLactationRecord } from '../pregnancy-lactation/pregnancy-lactation.types';
import type { HepaticDoseRecord } from '../hepatic-dose/hepatic-dose.types';
import type { SymptomTriageRecord } from '../symptom-triage/symptom-triage.types';
import type { TerminologyBundle } from '../terminology/terminology.types';
import type { ContentStats, ValidationViolation } from './bundle-validator';

export interface BundleManifestFile {
  name: string;
  sha256: string;
  size: number;
}

export interface BundleManifest {
  version: string;
  signedBy: string;
  signedAt: string;
  files: BundleManifestFile[];
}

export type BundleVerificationStatus =
  | 'ok'
  | 'skipped'
  | 'signature-invalid'
  | 'hash-mismatch'
  | 'missing'
  | 'content-validation-failed'
  | 'non-approved-content';

export interface BundleInfo {
  version: string;
  signedBy: string;
  signedAt: string;
  /** True iff signature + per-file hashes + content validation all passed and any configured approval gate is satisfied. */
  verified: boolean;
  verificationStatus: BundleVerificationStatus;
  files: BundleManifestFile[];
  /** Tallies of records by review status and domain. */
  contentStats?: ContentStats;
  /** Up to N validation violations (truncated by the loader to keep responses small). */
  contentViolations?: ValidationViolation[];
  /** When true, runtime requires every record to be reviewStatus='approved'. */
  requireApproved?: boolean;
}

export interface LoadedBundle {
  info: BundleInfo;
  conditions: ConditionGuidance[];
  drugs: DrugRecord[];
  interactions: DrugInteraction[];
  procedures: ProcedureGuidance[];
  cdsRules: CdsRule[];
  /** Optional — bundles signed before clinical-scores.json existed return []. */
  clinicalScores: ClinicalScore[];
  /** Optional — bundles signed before pharmacogenomics.json existed return []. */
  pgxGuidelines: PgxGuideline[];
  /** Optional — bundles signed before drug-disease-interactions.json existed return []. */
  drugDiseaseInteractions: DrugDiseaseInteraction[];
  /** Optional — bundles signed before immunization-schedule.json existed return []. */
  immunizationSchedule: ImmunizationScheduleEntry[];
  /** Optional — bundles signed before allergy-cross-reactivity.json existed return []. */
  allergyCrossReactivity: AllergyCrossReactivity[];
  /** Optional — bundles signed before notifiable-diseases.json existed return []. */
  notifiableDiseases: NotifiableDisease[];
  /** Optional — bundles signed before reference-ranges.json existed return []. */
  referenceRanges: ReferenceRange[];
  /** Optional — bundles signed before antidotes.json existed return []. */
  antidotes: Antidote[];
  /** Optional — bundles signed before toxidromes.json existed return []. */
  toxidromes: Toxidrome[];
  /** Optional — bundles signed before anticoagulant-reversal.json existed return []. */
  anticoagulantReversal: AnticoagulantReversal[];
  /** Optional — bundles signed before iv-compatibility.json existed return []. */
  ivCompatibility: IvCompatibility[];
  /** Optional — bundles signed before pregnancy-lactation.json existed return []. */
  pregnancyLactation: PregnancyLactationRecord[];
  /** Optional — bundles signed before hepatic-dose.json existed return []. */
  hepaticDose: HepaticDoseRecord[];
  /** Optional — bundles signed before symptom-triage.json existed return []. */
  symptomTriage: SymptomTriageRecord[];
  /** Optional — bundles signed before terminology.json existed return an empty TerminologyBundle. */
  terminology: TerminologyBundle;
}
