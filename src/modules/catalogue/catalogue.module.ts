import { Module } from '@nestjs/common';
import { DeveloperModule } from '../developer/developer.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { DrugsModule } from '../drugs/drugs.module';
import { ClinicalScoresModule } from '../clinical-scores/clinical-scores.module';
import { AntidotesModule } from '../antidotes/antidotes.module';
import { ToxidromesModule } from '../toxidromes/toxidromes.module';
import { AnticoagulantReversalModule } from '../anticoagulant-reversal/anticoagulant-reversal.module';
import { IvCompatibilityModule } from '../iv-compatibility/iv-compatibility.module';
import { PregnancyLactationModule } from '../pregnancy-lactation/pregnancy-lactation.module';
import { HepaticDoseModule } from '../hepatic-dose/hepatic-dose.module';
import { SymptomTriageModule } from '../symptom-triage/symptom-triage.module';
import { ReferenceRangesModule } from '../reference-ranges/reference-ranges.module';
import { DrugDiseaseModule } from '../drug-disease/drug-disease.module';
import { ImmunizationModule } from '../immunization/immunization.module';
import { AllergyModule } from '../allergy/allergy.module';
import { NotifiableModule } from '../notifiable/notifiable.module';
import { PharmacogenomicsModule } from '../pharmacogenomics/pharmacogenomics.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DoseProtocolsModule } from '../dose-protocols/dose-protocols.module';
import { ClinicalReferenceModule } from '../clinical-reference/clinical-reference.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

/** Cross-domain catalogue summaries (record counts) for the portal. */
@Module({
  imports: [
    DeveloperModule,
    ConditionsModule,
    DrugsModule,
    ClinicalScoresModule,
    AntidotesModule,
    ToxidromesModule,
    AnticoagulantReversalModule,
    IvCompatibilityModule,
    PregnancyLactationModule,
    HepaticDoseModule,
    SymptomTriageModule,
    ReferenceRangesModule,
    DrugDiseaseModule,
    ImmunizationModule,
    AllergyModule,
    NotifiableModule,
    PharmacogenomicsModule,
    IntegrationsModule,
    DoseProtocolsModule,
    ClinicalReferenceModule,
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
