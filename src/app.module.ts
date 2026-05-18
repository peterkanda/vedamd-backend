import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { PhiFreeLoggerModule } from './common/phi-free-logger';
import { HealthModule } from './health/health.module';
import { CdsModule } from './modules/cds/cds.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { TerminologyModule } from './modules/terminology/terminology.module';
import { DrugsModule } from './modules/drugs/drugs.module';
import { ConditionsModule } from './modules/conditions/conditions.module';
import { LlmModule } from './modules/llm/llm.module';
import { AuditModule } from './modules/audit/audit.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IntegrationLogModule } from './modules/integration-log/integration-log.module';
import { DeveloperModule } from './modules/developer/developer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PhiFreeLoggerModule,
    HealthModule,
    CdsModule,
    KnowledgeModule,
    TerminologyModule,
    DrugsModule,
    ConditionsModule,
    LlmModule,
    AuditModule,
    BundlesModule,
    IdentityModule,
    TenancyModule,
    AnalyticsModule,
    IntegrationLogModule,
    DeveloperModule,
  ],
})
export class AppModule {}
