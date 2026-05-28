import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConditionsService } from './conditions.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('conditions')
@Controller('v1/conditions')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ConditionsController {
  constructor(private readonly conditions: ConditionsService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List condition slugs and titles',
    description:
      'Discovery surface for content-driven CDS. Returns summaries; fetch full guidance by slug.',
  })
  list(@Query('domain') domain?: string, @Query('q') q?: string) {
    return { conditions: this.conditions.list({ domain, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get structured clinical guidance for a condition',
    description:
      'Returns presentation, red flags, diagnostics, ordered management steps, and source citations. No patient data is required or accepted at this endpoint.',
  })
  get(@Param('slug') slug: string) {
    const found = this.conditions.get(slug);
    if (!found) throw new NotFoundException(`Unknown condition: ${slug}`);
    return found;
  }
}
