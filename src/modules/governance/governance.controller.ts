import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { GovernanceService } from './governance.service';

/**
 * Content-governance visibility for the operator console. Read-only.
 * Shows the review-status posture per domain so a clinical lead can see
 * exactly how much of the bundle is still draft vs approved, and catches
 * any FR-024 violations (approved records missing reviewers/approvedAt).
 */
@ApiTags('governance')
@Controller('v1/governance')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class GovernanceController {
  constructor(private readonly svc: GovernanceService) {}

  @Get('content-review')
  @ApiOperation({
    summary: 'Per-domain content review-status coverage + FR-024 audit',
    description:
      'Returns total / approved / review / draft / deprecated counts for every content domain, plus the overall approved %, and any FR-024 violations (an approved record must carry ≥ 2 reviewers and an approvedAt timestamp). Use this to drive the draft → review → approved governance workflow.',
  })
  contentReview() {
    return this.svc.report();
  }
}
