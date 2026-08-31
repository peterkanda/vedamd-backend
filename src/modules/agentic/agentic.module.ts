import { Module } from '@nestjs/common';
import { AgenticController } from './agentic.controller';
import { AgenticService } from './agentic.service';
import { LlmPreferenceController } from './llm-preference.controller';
import { LlmPreferenceService } from './llm-preference.service';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';
import { KnowledgeRetrieverService } from './knowledge-retriever.service';
import { ProviderRouter } from './providers/provider-router';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { DeepseekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { SqlIngestionService } from './connectors/sql-ingestion.service';
import { PostgresConnector } from './connectors/postgres.connector';
import { MysqlConnector, MssqlConnector, OracleConnector } from './connectors/optional-connectors';
import { CdsModule } from '../cds/cds.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DeveloperModule } from '../developer/developer.module';
import { PoliciesModule } from '../policies/policies.module';
import { CustomRulesModule } from '../custom-rules/custom-rules.module';

/**
 * Agentic CDS module — the LLM reasoning layer that sits on top of the
 * deterministic CDS strategies. Depends on CdsModule (deterministic
 * safety floor) + KnowledgeModule (signed bundle) + DeveloperModule
 * (API-key guard).
 */
@Module({
  imports: [
    CdsModule,
    KnowledgeModule,
    DeveloperModule,
    PoliciesModule,
    CustomRulesModule,
    IdentityModule,
  ],
  controllers: [AgenticController, LlmPreferenceController],
  providers: [
    AgenticService,
    LlmPreferenceService,
    OperatorAuthGuard,
    KnowledgeRetrieverService,
    ProviderRouter,
    AnthropicProvider,
    OpenAiProvider,
    DeepseekProvider,
    GeminiProvider,
    OpenRouterProvider,
    SqlIngestionService,
    PostgresConnector,
    MysqlConnector,
    MssqlConnector,
    OracleConnector,
  ],
  exports: [
    AgenticService,
    ProviderRouter,
    KnowledgeRetrieverService,
    SqlIngestionService,
    LlmPreferenceService,
  ],
})
export class AgenticModule {}
