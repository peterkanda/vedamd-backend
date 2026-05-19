import { Global, Module } from '@nestjs/common';
import { IntegrationLogController } from './integration-log.controller';
import { IntegrationLogService } from './integration-log.service';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';

/**
 * SRS §6.3.17 — Integration Telemetry & Bounded Logs.
 *
 * Per-integrator ring buffer (50k entries cap / 30-day TTL) of recent
 * API calls. Strict field allow-list enforced at TS type + runtime +
 * (production) DB constraint. Stores only structural metadata —
 * never request bodies, never patient identifiers, never LLM prompts.
 * Read endpoint guarded by OperatorAuthGuard.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [IntegrationLogController],
  providers: [IntegrationLogService, OperatorAuthGuard],
  exports: [IntegrationLogService],
})
export class IntegrationLogModule {}
