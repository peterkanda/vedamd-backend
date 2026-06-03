import { Module } from '@nestjs/common';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';
import { ReferenceDoseService } from './reference-dose.service';
import { ReferenceDiagramService } from './reference-diagram.service';
import { ReferenceChatService } from './reference-chat.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DrugsModule } from '../drugs/drugs.module';
import { AgenticModule } from '../agentic/agentic.module';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Clinician reference module — the medic/doctor-facing reference
 * experience: organised browse/search, dose calculator, deterministic
 * diagrams + a guarded reference chat. Reuses AgenticModule's
 * ProviderRouter + retriever for the chat; KnowledgeModule for content;
 * DrugsModule for the shared dose calculator; DeveloperModule so the
 * ApiKeyGuard can resolve ApiKeysService.
 */
@Module({
  imports: [KnowledgeModule, DrugsModule, AgenticModule, DeveloperModule],
  controllers: [ReferenceController],
  providers: [
    ReferenceService,
    ReferenceDoseService,
    ReferenceDiagramService,
    ReferenceChatService,
  ],
  exports: [ReferenceService],
})
export class ReferenceModule {}
