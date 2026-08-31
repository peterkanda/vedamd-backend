import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { UsageService } from './usage.service';
import { OperatorAuthGuard, OperatorOrApiKeyGuard } from '../../common/operator-auth';

/** Whitelist of client-side feature events we accept. Keeps the
 *  endpoint a fixed enum — no free-form text reaches the events table. */
const ALLOWED_CLIENT_EVENTS = new Set([
  'dose-calc-paeds',
  'dose-calc-adult-vancomycin',
  'dose-calc-adult-gentamicin',
  'dose-calc-adult-enoxaparin',
  'ibw-adjbw',
  'eq-cockcroft-gault',
  'eq-egfr-ckd-epi',
  'eq-anion-gap',
  'eq-corrected-calcium',
  'eq-map',
  'eq-osmolality',
  'eq-bmi',
  'eq-gcs',
  'eq-meld',
  'eq-parkland',
  'eq-opioid-conv',
  'score-news2',
  'score-qsofa',
  'score-curb65',
  'score-wells-pe',
  'score-chads-vasc',
  'page-view-conditions',
  'page-view-drugs',
  'page-view-renal-dose',
  'page-view-hepatic-dose',
  'page-view-pregnancy-lactation',
  'page-view-antidotes',
  'palette-search',
]);

/**
 * Per-integrator usage analytics. Scoped to the calling operator's
 * integratorId — an operator only ever sees their own tenant's usage.
 */
@ApiTags('usage')
@Controller('v1/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @UseGuards(OperatorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent usage events (newest first) for the calling integrator' })
  list(@Req() req: FastifyRequest, @Query('limit') limit?: string, @Query('since') since?: string) {
    return this.usage.query(req.operator!.integratorId, {
      limit: limit ? Number(limit) : undefined,
      sinceMs: parseSince(since),
    });
  }

  @Get('summary')
  @UseGuards(OperatorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Usage rollup (by category, endpoint, day, actor type) for the dashboard',
  })
  summary(@Req() req: FastifyRequest, @Query('since') since?: string) {
    return this.usage.summary(req.operator!.integratorId, { sinceMs: parseSince(since) });
  }

  /**
   * Client-side feature events — runs of calculators / equations that
   * don't otherwise hit an API endpoint. Whitelist-gated and PHI-free:
   * we accept ONLY a known event name (no free text), no metadata, and
   * we hash the operator id behind the existing UsageService.record().
   */
  @Post('events/client')
  @HttpCode(204)
  @UseGuards(OperatorOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a client-side feature use (calculator run, page view).',
    description:
      'Whitelist-gated: only the fixed enum of `event` names is accepted; metadata is NOT stored. PHI-free.',
  })
  recordClientEvent(@Req() req: FastifyRequest, @Body() body: { event?: string }): void {
    const event = typeof body?.event === 'string' ? body.event.trim() : '';
    if (!event || !ALLOWED_CLIENT_EVENTS.has(event)) {
      throw new BadRequestException(
        `Unknown client event. Send one of the whitelisted event ids (see /v1/usage/events/client docs).`,
      );
    }
    const op = req.operator ?? null;
    const apiKey = req.apiKey ?? null;
    this.usage.record({
      integratorId: op?.integratorId ?? apiKey?.integratorId ?? null,
      actorType: op ? 'operator' : apiKey ? 'api_key' : 'anonymous',
      actorId: op?.sub ?? null,
      actorHash: apiKey?.fingerprint ?? null,
      method: 'POST',
      endpoint: `/client-event/${event}`,
      category: 'feature',
      statusCode: 204,
      latencyMs: 0,
      environment: apiKey?.environment ?? null,
    });
  }
}

function parseSince(since?: string): number | undefined {
  if (!since) return undefined;
  const ms = Date.parse(since);
  return Number.isFinite(ms) ? ms : undefined;
}
