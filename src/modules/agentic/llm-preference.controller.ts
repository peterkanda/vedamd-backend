import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { ProviderRouter } from './providers/provider-router';
import { LlmPreferenceService, VALID_PROVIDERS } from './llm-preference.service';

/**
 * Developer-portal endpoints for picking which LLM the agentic engine
 * and reference chat should use for this integrator. The list endpoint
 * advertises every supported provider plus whether it's configured on
 * this deployment, so the UI can show enabled/disabled options.
 */
@ApiTags('developer')
@Controller('v1/developer/llm-preference')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class LlmPreferenceController {
  constructor(
    private readonly prefs: LlmPreferenceService,
    private readonly router: ProviderRouter,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'List supported LLM providers and whether each is configured.' })
  listProviders() {
    return {
      providers: this.router.list(),
      defaults: VALID_PROVIDERS,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get this integrator\'s LLM preference.' })
  get(@Req() req: FastifyRequest) {
    return this.prefs.get(req.operator!.integratorId);
  }

  @Put()
  @ApiOperation({
    summary: 'Set this integrator\'s LLM provider and optional model override.',
  })
  set(@Req() req: FastifyRequest, @Body() body: { provider?: string | null; model?: string | null }) {
    try {
      return this.prefs.set(req.operator!.integratorId, body);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
