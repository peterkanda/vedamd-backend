import { Global, Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * SRS §6.3.2 — Knowledge Content Service.
 *
 * Global so that Conditions / Drugs / Procedures can inject it
 * without each domain module re-importing it.
 */
@Global()
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
