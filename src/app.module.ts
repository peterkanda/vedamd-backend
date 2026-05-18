import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { HealthModule } from './health/health.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { CdsModule } from './modules/cds/cds.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { TerminologyModule } from './modules/terminology/terminology.module';
import { DrugsModule } from './modules/drugs/drugs.module';
import { FhirModule } from './modules/fhir/fhir.module';
import { LlmModule } from './modules/llm/llm.module';
import { AuditModule } from './modules/audit/audit.module';
import { SyncModule } from './modules/sync/sync.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    SupabaseModule,
    HealthModule,
    CdsModule,
    KnowledgeModule,
    TerminologyModule,
    DrugsModule,
    FhirModule,
    LlmModule,
    AuditModule,
    SyncModule,
    IdentityModule,
    TenancyModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
