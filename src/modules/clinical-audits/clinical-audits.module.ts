import { Module } from '@nestjs/common';
import { ClinicalAuditsController } from './clinical-audits.controller';
import { ClinicalAuditsService } from './clinical-audits.service';
import { AgenticModule } from '../agentic/agentic.module';
import { CustomRulesModule } from '../custom-rules/custom-rules.module';
import { PoliciesModule } from '../policies/policies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Per-integrator on-demand clinical audits. Binds a named query
 * (SqlIngestionService) + custom rules (CustomRulesService) + uploaded
 * policies (PoliciesService) + a threshold + outbound channels
 * (NotificationsService).
 *
 * Audits are run when the developer hits POST /v1/clinical-audits/:id/run.
 * No scheduler — audits never run autonomously.
 */
@Module({
  imports: [
    AgenticModule,
    CustomRulesModule,
    PoliciesModule,
    NotificationsModule,
    IdentityModule,
  ],
  controllers: [ClinicalAuditsController],
  providers: [ClinicalAuditsService, OperatorAuthGuard],
  exports: [ClinicalAuditsService],
})
export class ClinicalAuditsModule {}
