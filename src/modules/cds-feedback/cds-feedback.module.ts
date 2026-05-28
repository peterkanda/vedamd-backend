import { Module } from '@nestjs/common';
import {
  CdsFeedbackSpecController,
  CdsFeedbackOperatorController,
} from './cds-feedback.controller';
import { CdsFeedbackService } from './cds-feedback.service';
import { CdsModule } from '../cds/cds.module';
import { IdentityModule } from '../identity/identity.module';
import { DeveloperModule } from '../developer/developer.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * CDS Hooks 1.0 §6 — Feedback ingest + per-rule aggregation.
 *
 * Closes the override-reason feedback loop: when a clinician dismisses
 * a card the EMR returns, the EMR posts to /cds-services/:id/feedback
 * with the outcome + reason. The platform stores PHI-free aggregates
 * (rule id, service id, hook, outcome, reason code) so the editorial
 * board can identify rules with high override rates and retire
 * false-positive content.
 */
@Module({
  imports: [CdsModule, IdentityModule, DeveloperModule],
  controllers: [CdsFeedbackSpecController, CdsFeedbackOperatorController],
  providers: [CdsFeedbackService, OperatorAuthGuard],
  exports: [CdsFeedbackService],
})
export class CdsFeedbackModule {}
