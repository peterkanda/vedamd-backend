import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Content-governance reporting. Surfaces review-status coverage across
 * the signed bundle + enforces FR-024 visibility. Read-only; never
 * mutates review status (approval requires real clinical reviewers via
 * the content pipeline).
 */
@Module({
  imports: [KnowledgeModule, IdentityModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, OperatorAuthGuard],
  exports: [GovernanceService],
})
export class GovernanceModule {}
