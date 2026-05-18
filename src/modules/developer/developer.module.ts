import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';

/**
 * SRS §6.3.16 — Developer Portal (backend).
 *
 * API-key lifecycle endpoints (FR-313). Every route guarded by the
 * OperatorAuthGuard — callers authenticate as the operator (an
 * integrator admin), not the integrator. Sub-claim from the verified
 * JWT becomes request.operator.sub; the configured integrator_id
 * claim becomes request.operator.integratorId.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, OperatorAuthGuard],
  exports: [ApiKeysService],
})
export class DeveloperModule {}
