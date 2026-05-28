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
import { ToxidromesModule } from './modules/toxidromes/toxidromes.module';
import { AnticoagulantReversalModule } from './modules/anticoagulant-reversal/anticoagulant-reversal.module';
import { IvCompatibilityModule } from './modules/iv-compatibility/iv-compatibility.module';
import { PregnancyLactationModule } from './modules/pregnancy-lactation/pregnancy-lactation.module';
import { HepaticDoseModule } from './modules/hepatic-dose/hepatic-dose.module';
import { SymptomTriageModule } from './modules/symptom-triage/symptom-triage.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { DoseProtocolsModule } from './modules/dose-protocols/dose-protocols.module';
import { ClinicalToolsModule } from './modules/clinical-tools/clinical-tools.module';
import { LlmModule } from './modules/llm/llm.module';
import { AuditModule } from './modules/audit/audit.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IntegrationLogModule } from './modules/integration-log/integration-log.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { AgenticModule } from './modules/agentic/agentic.module';
import { CustomRulesModule } from './modules/custom-rules/custom-rules.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ClinicalAuditsModule } from './modules/clinical-audits/clinical-audits.module';
import { DataSourcesModule } from './modules/data-sources/data-sources.module';
import { CdsFeedbackModule } from './modules/cds-feedback/cds-feedback.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { UsageModule } from './modules/usage/usage.module';

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
    ToxidromesModule,
    AnticoagulantReversalModule,
    IvCompatibilityModule,
    PregnancyLactationModule,
    HepaticDoseModule,
    SymptomTriageModule,
    IntegrationsModule,
    DoseProtocolsModule,
    ClinicalToolsModule,
    LlmModule,
    AuditModule,
    BundlesModule,
    IdentityModule,
    TenancyModule,
    AnalyticsModule,
    IntegrationLogModule,
    DeveloperModule,
    AgenticModule,
    CustomRulesModule,
    NotificationsModule,
    ClinicalAuditsModule,
    DataSourcesModule,
    CdsFeedbackModule,
    GovernanceModule,
    ReferenceModule,
    UsageModule,
  ],
})
export class AppModule {}
