import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { BundleInfo } from '../knowledge/knowledge.types';
import { ConditionsService } from '../conditions/conditions.service';
import { DrugsService } from '../drugs/drugs.service';
import { ClinicalScoresService } from '../clinical-scores/clinical-scores.service';
import { AntidotesService } from '../antidotes/antidotes.service';
import { ToxidromesService } from '../toxidromes/toxidromes.service';
import { AnticoagulantReversalService } from '../anticoagulant-reversal/anticoagulant-reversal.service';
import { IvCompatibilityService } from '../iv-compatibility/iv-compatibility.service';
import { PregnancyLactationService } from '../pregnancy-lactation/pregnancy-lactation.service';
import { HepaticDoseService } from '../hepatic-dose/hepatic-dose.service';
import { SymptomTriageService } from '../symptom-triage/symptom-triage.service';
import { ReferenceRangesService } from '../reference-ranges/reference-ranges.service';
import { DrugDiseaseService } from '../drug-disease/drug-disease.service';
import { ImmunizationService } from '../immunization/immunization.service';
import { AllergyService } from '../allergy/allergy.service';
import { NotifiableService } from '../notifiable/notifiable.service';
import { PharmacogenomicsService } from '../pharmacogenomics/pharmacogenomics.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { DoseProtocolsService } from '../dose-protocols/dose-protocols.service';
import { ClinicalReferenceService } from '../clinical-reference/clinical-reference.service';

/** Record counts per catalogue domain — the length of each unfiltered list endpoint. */
export interface CatalogueCounts {
  conditions: number;
  drugs: number;
  clinicalScores: number;
  antidotes: number;
  toxidromes: number;
  anticoagulantReversal: number;
  ivCompatibility: number;
  pregnancyLactation: number;
  hepaticDose: number;
  symptomTriage: number;
  referenceRanges: number;
  drugDisease: number;
  immunization: number;
  allergy: number;
  notifiable: number;
  pharmacogenomics: number;
  integrations: number;
  doseProtocolDiagnoses: number;
  clinicalProcedures: number;
  bedsideInterpretation: number;
  preventiveCare: number;
  growthDevelopment: number;
}

/**
 * The portal's Overview and Catalogue pages showed how many records each
 * domain holds by downloading every list (about 20 requests, several hundred
 * KB) and taking its length. This computes the same numbers from the same
 * list() calls, once per loaded bundle.
 */
@Injectable()
export class CatalogueService {
  private cached: { info: BundleInfo; counts: CatalogueCounts } | null = null;

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly conditions: ConditionsService,
    private readonly drugs: DrugsService,
    private readonly scores: ClinicalScoresService,
    private readonly antidotes: AntidotesService,
    private readonly toxidromes: ToxidromesService,
    private readonly reversal: AnticoagulantReversalService,
    private readonly ivCompatibility: IvCompatibilityService,
    private readonly pregnancyLactation: PregnancyLactationService,
    private readonly hepaticDose: HepaticDoseService,
    private readonly symptomTriage: SymptomTriageService,
    private readonly referenceRanges: ReferenceRangesService,
    private readonly drugDisease: DrugDiseaseService,
    private readonly immunization: ImmunizationService,
    private readonly allergy: AllergyService,
    private readonly notifiable: NotifiableService,
    private readonly pharmacogenomics: PharmacogenomicsService,
    private readonly integrations: IntegrationsService,
    private readonly doseProtocols: DoseProtocolsService,
    private readonly clinicalReference: ClinicalReferenceService,
  ) {}

  counts(): CatalogueCounts {
    const info = this.knowledge.getInfo();
    if (this.cached?.info !== info) {
      this.cached = {
        info,
        counts: {
          conditions: this.conditions.list().length,
          drugs: this.drugs.list().length,
          clinicalScores: this.scores.list().length,
          antidotes: this.antidotes.list().length,
          toxidromes: this.toxidromes.list().length,
          anticoagulantReversal: this.reversal.list().length,
          ivCompatibility: this.ivCompatibility.list().length,
          pregnancyLactation: this.pregnancyLactation.list().length,
          hepaticDose: this.hepaticDose.list().length,
          symptomTriage: this.symptomTriage.list().length,
          referenceRanges: this.referenceRanges.list().length,
          drugDisease: this.drugDisease.list().length,
          immunization: this.immunization.list().length,
          allergy: this.allergy.list().length,
          notifiable: this.notifiable.list().length,
          pharmacogenomics: this.pharmacogenomics.list().length,
          integrations: this.integrations.list().length,
          doseProtocolDiagnoses: this.doseProtocols.diagnoses().length,
          clinicalProcedures: this.clinicalReference.list('clinical-procedures').length,
          bedsideInterpretation: this.clinicalReference.list('bedside-interpretation').length,
          preventiveCare: this.clinicalReference.list('preventive-care').length,
          growthDevelopment: this.clinicalReference.list('growth-development').length,
        },
      };
    }
    return this.cached.counts;
  }
}
