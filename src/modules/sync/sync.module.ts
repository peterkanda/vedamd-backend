import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';

/**
 * SRS §6.3.8 — Offline Sync Service.
 * Signed knowledge bundles, delta sync, conflict resolution, idempotent retries.
 */
@Module({
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
