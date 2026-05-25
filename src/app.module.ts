import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { DatabaseModule } from './db/database.module';
import { CacheModule } from './common/cache';
import { PhiFreeLoggerModule } from './common/phi-free-logger';
import { HealthModule } from './health/health.module';
import { CdsModule } from './modules/cds/cds.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { TerminologyModule } from './modules/terminology/terminology.module';
import { DrugsModule } from './modules/drugs/drugs.module';
import { ConditionsModule } from './modules/conditions/conditions.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { ClinicalScoresModule } from './modules/clinical-scores/clinical-scores.module';
import { PharmacogenomicsModule } from './modules/pharmacogenomics/pharmacogenomics.module';
import { DrugDiseaseModule } from './modules/drug-disease/drug-disease.module';
import { ImmunizationModule } from './modules/immunization/immunization.module';
import { AllergyModule } from './modules/allergy/allergy.module';
import { NotifiableModule } from './modules/notifiable/notifiable.module';
import { ReferenceRangesModule } from './modules/reference-ranges/reference-ranges.module';
import { AntidotesModule } from './modules/antidotes/antidotes.module';
import { LlmModule } from './modules/llm/llm.module';
import { AuditModule } from './modules/audit/audit.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IntegrationLogModule } from './modules/integration-log/integration-log.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { AgenticModule } from './modules/agentic/agentic.module';
import { ReferenceModule } from './modules/reference/reference.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    CacheModule,
    PhiFreeLoggerModule,
    HealthModule,
    CdsModule,
    KnowledgeModule,
    TerminologyModule,
    DrugsModule,
    ConditionsModule,
    ProceduresModule,
    PoliciesModule,
    ClinicalScoresModule,
    PharmacogenomicsModule,
    DrugDiseaseModule,
    ImmunizationModule,
    AllergyModule,
    NotifiableModule,
    ReferenceRangesModule,
    AntidotesModule,
    LlmModule,
    AuditModule,
    BundlesModule,
    IdentityModule,
    TenancyModule,
    AnalyticsModule,
    IntegrationLogModule,
    DeveloperModule,
    AgenticModule,
    ReferenceModule,
  ],
})
export class AppModule {}
