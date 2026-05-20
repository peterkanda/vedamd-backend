import { Module } from '@nestjs/common';
import { AgenticController } from './agentic.controller';
import { AgenticService } from './agentic.service';
import { KnowledgeRetrieverService } from './knowledge-retriever.service';
import { ProviderRouter } from './providers/provider-router';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { SqlIngestionService } from './connectors/sql-ingestion.service';
import { PostgresConnector } from './connectors/postgres.connector';
import {
  MysqlConnector,
  MssqlConnector,
  OracleConnector,
} from './connectors/optional-connectors';
import { CdsModule } from '../cds/cds.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Agentic CDS module — the LLM reasoning layer that sits on top of the
 * deterministic CDS strategies. Depends on CdsModule (deterministic
 * safety floor) + KnowledgeModule (signed bundle) + DeveloperModule
 * (API-key guard).
 */
@Module({
  imports: [CdsModule, KnowledgeModule, DeveloperModule],
  controllers: [AgenticController],
  providers: [
    AgenticService,
    KnowledgeRetrieverService,
    ProviderRouter,
    AnthropicProvider,
    OpenAiProvider,
    SqlIngestionService,
    PostgresConnector,
    MysqlConnector,
    MssqlConnector,
    OracleConnector,
  ],
  exports: [AgenticService, ProviderRouter, KnowledgeRetrieverService],
})
export class AgenticModule {}
