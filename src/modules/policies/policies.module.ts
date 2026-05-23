import { Module } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Per-integrator policy / standards management. The service is exported
 * so the agentic engine can retrieve relevant sections at evaluation
 * time and cite them on returned cards.
 */
@Module({
  imports: [IdentityModule],
  controllers: [PoliciesController],
  providers: [PoliciesService, OperatorAuthGuard],
  exports: [PoliciesService],
})
export class PoliciesModule {}
