import { Module } from '@nestjs/common';
import { AgenticModule } from '../agentic/agentic.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * Mobile assistant chat module — the cloud/OpenAI path for the VedaMD app.
 * Reuses the ProviderRouter (from AgenticModule) and KnowledgeSearchService
 * (from KnowledgeModule) so it shares the same LLM fallback/retry and the
 * same verified content used everywhere else.
 */
@Module({
  imports: [AgenticModule, KnowledgeModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
