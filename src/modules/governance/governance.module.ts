import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { ContentReviewService } from './content-review.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Content governance: review-status coverage, release readiness, and the
 * risk-tiered clinical review queue. Never mutates the signed bundle —
 * review decisions are recorded and exported for the content pipeline
 * (scripts/promote-bundle.ts --from-decisions) to apply to the next version.
 */
@Module({
  imports: [KnowledgeModule, IdentityModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, ContentReviewService, OperatorAuthGuard],
  exports: [GovernanceService, ContentReviewService],
})
export class GovernanceModule {}
