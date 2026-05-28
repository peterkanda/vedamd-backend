import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { UsageService } from './usage.service';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Per-integrator usage analytics. Scoped to the calling operator's
 * integratorId — an operator only ever sees their own tenant's usage.
 */
@ApiTags('usage')
@Controller('v1/usage')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @ApiOperation({ summary: 'Recent usage events (newest first) for the calling integrator' })
  list(
    @Req() req: FastifyRequest,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.usage.query(req.operator!.integratorId, {
      limit: limit ? Number(limit) : undefined,
      sinceMs: parseSince(since),
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Usage rollup (by category, endpoint, day, actor type) for the dashboard' })
  summary(@Req() req: FastifyRequest, @Query('since') since?: string) {
    return this.usage.summary(req.operator!.integratorId, { sinceMs: parseSince(since) });
  }
}

function parseSince(since?: string): number | undefined {
  if (!since) return undefined;
  const ms = Date.parse(since);
  return Number.isFinite(ms) ? ms : undefined;
}
