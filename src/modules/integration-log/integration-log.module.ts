import { Global, Module } from '@nestjs/common';
import { IntegrationLogController } from './integration-log.controller';
import { IntegrationLogService } from './integration-log.service';

/**
 * SRS §6.3.17 — Integration Telemetry & Bounded Logs.
 *
 * Per-integrator ring buffer (50k entries cap / 30-day TTL) of recent
 * API calls. Strict field allow-list enforced at TS type + runtime +
 * (production) DB constraint. Stores only structural metadata —
 * never request bodies, never patient identifiers, never LLM prompts.
 */
@Global()
@Module({
  controllers: [IntegrationLogController],
  providers: [IntegrationLogService],
  exports: [IntegrationLogService],
})
export class IntegrationLogModule {}
