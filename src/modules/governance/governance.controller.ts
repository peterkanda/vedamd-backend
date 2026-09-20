import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { GovernanceService } from './governance.service';
import { ContentReviewService } from './content-review.service';
import type { ReviewState, SubmitReviewDto } from './content-review.types';

const STATES: ReviewState[] = [
  'needs-review',
  'needs-second-review',
  'changes-requested',
  'ready-to-promote',
];

function optionalInt(name: string, raw?: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new BadRequestException(`${name} must be a non-negative integer.`);
  return n;
}

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
  constructor(
    private readonly svc: GovernanceService,
    private readonly reviews: ContentReviewService,
  ) {}

  @Get('content-review')
  @ApiOperation({
    summary: 'Per-domain content review-status coverage + FR-024 audit',
    description:
      'Returns total / approved / review / draft / deprecated counts for every content domain, plus the overall approved %, and any FR-024 violations (an approved record must carry ≥ 2 reviewers and an approvedAt timestamp). Use this to drive the draft → review → approved governance workflow.',
  })
  contentReview() {
    return this.svc.report();
  }

  @Get('readiness')
  @ApiOperation({
    summary: 'Release readiness of the signed bundle for approved-only serving',
    description:
      'One pass / warn / block verdict per trust dimension — content approval (tier-1 domains first), FR-024, the approved-only runtime gate, drug-code integrity, citation URLs, uncapped per-kg doses, country-overlay sign-off and manufacturer labels — plus per-domain approval ordered by clinical risk. releaseReady is true only when nothing blocks. Read-only.',
  })
  readiness() {
    return this.svc.readiness();
  }

  @Get('review-queue')
  @ApiOperation({
    summary: 'Risk-tiered clinical review queue',
    description:
      'Unapproved records ordered by clinical-risk tier (1 = dosing / interactions / CDS rules / antidotes), then KEML level, domain and id. Each item carries its content hash, review state (needs-review, needs-second-review, changes-requested, ready-to-promote), approval count, safety flags and any reason approval would be refused. Filters: tier, domain (bundle file name), state, limit (≤ 500), offset.',
  })
  queue(
    @Query('tier') tier?: string,
    @Query('domain') domain?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (state !== undefined && !STATES.includes(state as ReviewState)) {
      throw new BadRequestException(`state must be one of ${STATES.join(', ')}.`);
    }
    const t = optionalInt('tier', tier);
    if (t !== undefined && ![1, 2, 3].includes(t))
      throw new BadRequestException('tier must be 1, 2 or 3.');
    return this.reviews.queue({
      tier: t,
      domain: domain || undefined,
      state: state as ReviewState | undefined,
      limit: optionalInt('limit', limit),
      offset: optionalInt('offset', offset),
    });
  }

  @Get('review-queue/:domain/:recordId')
  @ApiOperation({
    summary: 'Review packet: one record with its flags and decision history',
    description:
      'The full record as it appears in the signed bundle, its current content hash (send it back with your decision), safety flags, approval blockers, and every decision so far — decisions made on earlier content are marked stale and no longer count.',
  })
  packet(@Param('domain') domain: string, @Param('recordId') recordId: string) {
    return this.reviews.packet(domain, recordId);
  }

  @Post('reviews')
  @ApiOperation({
    summary: 'Record a clinical review decision (FR-024)',
    description:
      'Body: { domain, recordId, recordHash, decision: "approve" | "request-changes", role, notes? }. The reviewer identity is taken from the authenticated operator, never the body, and must be listed in CLINICAL_REVIEWER_SUBS. Refused (409) when the hash is stale, the reviewer already approved, or the record cannot be approved yet (known-wrong drug code, D-tier-only citations). Does not change the signed bundle.',
  })
  submit(@Body() body: SubmitReviewDto, @Req() req: FastifyRequest) {
    return this.reviews.submit(body ?? ({} as SubmitReviewDto), req.operator);
  }

  @Get('reviews/export')
  @ApiOperation({
    summary: 'Approvals and corrections ready to apply to the next bundle version',
    description:
      'Records and correction proposals whose current content has ≥ 2 distinct reviewers approving and no outstanding change request (dev-bypass decisions never count). Save the response, then against the next bundle version: npm run corrections:apply -- --from-decisions <file> --bundle <dir> (corrections), then npm run bundle:promote -- --from-decisions <file> --bundle <dir> (approvals), then re-sign.',
  })
  exportApprovals() {
    return this.reviews.exportApprovals();
  }
}
