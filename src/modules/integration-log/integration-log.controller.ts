import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationLogService } from './integration-log.service';

@ApiTags('integration-log')
@Controller('v1/integration-log')
export class IntegrationLogController {
  constructor(private readonly log: IntegrationLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Query the bounded integration log',
    description:
      'FR-336 — newest-first ring-buffer view of recent API calls. Bounded by FR-331 (50k entries) and FR-332 (30-day TTL). Field set per FR-333.',
  })
  query(
    @Headers('x-integrator-id') integratorId: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const sinceMs = since ? Date.parse(since) : undefined;
    return this.log.query(integratorId, {
      limit: limit ? Number(limit) : undefined,
      sinceMs: Number.isFinite(sinceMs) ? sinceMs : undefined,
    });
  }
}
