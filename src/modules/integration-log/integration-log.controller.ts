import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IntegrationLogService } from './integration-log.service';
import { OperatorAuthGuard } from '../../common/operator-auth';

@ApiTags('integration-log')
@Controller('v1/integration-log')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class IntegrationLogController {
  constructor(private readonly log: IntegrationLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Query the bounded integration log',
    description:
      "FR-336 — newest-first ring-buffer view of recent API calls. Bounded by FR-331 (50k entries) and FR-332 (30-day TTL). Field set per FR-333. Scoped to the calling operator's integratorId.",
  })
  query(
    @Req() req: FastifyRequest,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const sinceMs = since ? Date.parse(since) : undefined;
    return this.log.query(req.operator!.integratorId, {
      limit: limit ? Number(limit) : undefined,
      sinceMs: Number.isFinite(sinceMs) ? sinceMs : undefined,
    });
  }
}
