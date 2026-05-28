import { Global, Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * SRS §6.3.2 — Knowledge Content Service.
 *
 * Global so that Conditions / Drugs / Procedures can inject it
 * without each domain module re-importing it.
 *
 * DeveloperModule is imported so the guarded `/v1/knowledge/search`
 * route can resolve ApiKeyGuard → ApiKeysService.
 */
@Global()
@Module({
  imports: [DeveloperModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeSearchService],
  exports: [KnowledgeService, KnowledgeSearchService],
})
export class KnowledgeModule {}
