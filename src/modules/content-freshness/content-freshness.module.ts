import { Module } from '@nestjs/common';
import { ContentFreshnessController } from './content-freshness.controller';
import { ContentFreshnessService } from './content-freshness.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Scans the signed content bundle on a weekly cadence and emits a
 * "what to re-verify against upstream sources" review queue. The audit
 * never auto-edits clinical content (anti-hallucination) — it only
 * surfaces records whose citations have aged past the threshold.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ContentFreshnessController],
  providers: [ContentFreshnessService],
  exports: [ContentFreshnessService],
})
export class ContentFreshnessModule {}
