import { Module } from '@nestjs/common';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

/**
 * SRS §6.3.8 — Offline Rule Bundle Distribution (Embeddable Library).
 *
 * Distributes signed clinical knowledge bundles (CQL rules + drug DB
 * subset + terminology subset) to host platforms (EMR mobile apps,
 * CHW apps). Bundles are Ed25519-signed (FR-141), diff-updated
 * (FR-146), and expire after 90 days (FR-149).
 *
 * Explicitly NOT a patient-sync service (FR-150). Patient data
 * movement is exclusively between integrators and their own
 * infrastructure.
 */
@Module({
  imports: [KnowledgeModule],
  controllers: [BundlesController],
  providers: [BundlesService],
  exports: [BundlesService],
})
export class BundlesModule {}
