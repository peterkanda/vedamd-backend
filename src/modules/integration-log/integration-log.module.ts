import { Global, Module } from '@nestjs/common';
import { IntegrationLogController } from './integration-log.controller';
import { IntegrationLogService } from './integration-log.service';
import { OperatorOrApiKeyGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';
import { DeveloperModule } from '../developer/developer.module';

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
  imports: [IdentityModule, DeveloperModule],
  controllers: [IntegrationLogController],
  providers: [IntegrationLogService, OperatorOrApiKeyGuard],
  exports: [IntegrationLogService],
})
export class IntegrationLogModule {}
