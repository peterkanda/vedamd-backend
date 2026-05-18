import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * SRS §6.3.2 — Knowledge Content Service.
 * Stores CQL/DMN rules, WHO SMART Guideline content packages, versioning,
 * multi-reviewer approval, cryptographic signing, regression test cases.
 */
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
