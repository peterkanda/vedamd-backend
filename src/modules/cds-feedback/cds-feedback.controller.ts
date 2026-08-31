import { Body, Controller, Get, HttpCode, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Post } from '@nestjs/common';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { CdsFeedbackService } from './cds-feedback.service';
import type { CdsFeedbackRequest } from './cds-feedback.types';

type ApiKeyRequest = FastifyRequest & {
  apiKey?: { integratorId: string };
};
type OperatorRequest = FastifyRequest & {
  operator?: { integratorId: string; userId?: string };
};

/**
 * CDS Hooks 1.0 §6 feedback endpoint. The EMR posts after the clinician
 * has acted on (or dismissed) a card we returned. Same auth surface as
 * /cds-services/:id (API key + cds:evaluate scope) so it's a drop-in.
 *
 * Returns 200 with a small ingest summary instead of the spec's bare
 * 204 — the EMR developer panel uses it for diagnostics. Spec-compliant
 * EMR clients can ignore the body.
 */
@ApiTags('cds-hooks')
@Controller('cds-services')
export class CdsFeedbackSpecController {
  constructor(private readonly svc: CdsFeedbackService) {}

  @Post(':serviceId/feedback')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'CDS Hooks 1.0 feedback ingest',
    description:
      'Accepts an array of feedback entries per CDS Hooks 1.0 §6. Each entry references a card UUID we minted in a prior /cds-services response. PHI-free — only the outcome + override-reason code + optional comment is persisted.',
  })
  async ingest(
    @Param('serviceId') serviceId: string,
    @Body() body: CdsFeedbackRequest,
    @Req() req: ApiKeyRequest,
  ) {
    const integratorId = req.apiKey!.integratorId;
    const result = await this.svc.ingest(integratorId, serviceId, body);
    return result;
  }
}

/**
 * Developer dashboard endpoints — same auth as the rest of the
 * operator-facing console (OperatorAuthGuard). Read-only.
 */
@ApiTags('cds-feedback')
@Controller('v1/cds-feedback')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class CdsFeedbackOperatorController {
  constructor(private readonly svc: CdsFeedbackService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Per-rule feedback aggregation',
    description:
      'Returns total feedback, accepted, overridden, override-rate %, and the top 3 override reason codes for every rule that has feedback. Sorted by total feedback descending. Rules being overridden ≥ 50 % of the time are flagged for editorial review (use this signal to retire false-positive rules).',
  })
  async summary(@Req() req: OperatorRequest) {
    return { rules: await this.svc.summaryByRule(req.operator!.integratorId) };
  }

  @Get()
  @ApiOperation({
    summary: 'List feedback entries (latest first) optionally filtered by ruleId',
  })
  async list(
    @Req() req: OperatorRequest,
    @Query('ruleId') ruleId: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const n = limit ? Math.max(1, Math.min(parseInt(limit, 10) || 50, 200)) : 50;
    return {
      feedback: await this.svc.listByRule(req.operator!.integratorId, ruleId ?? null, n),
    };
  }
}
