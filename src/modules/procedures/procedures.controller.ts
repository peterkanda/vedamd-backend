import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProceduresService } from './procedures.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('procedures')
@Controller('v1/procedures')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ProceduresController {
  constructor(private readonly procedures: ProceduresService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List procedures',
    description:
      'Filters: domain (e.g. emergency, paediatrics), q (free text over slug/title/CPT). Returns summaries; fetch full guidance by slug.',
  })
  list(@Query('domain') domain?: string, @Query('q') q?: string) {
    return { procedures: this.procedures.list({ domain, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get structured procedural guidance by slug',
    description:
      'Returns indications, contraindications, equipment, consent notes, ordered steps with safety checks, red flags, post-procedure care, complications and management, and citations.',
  })
  get(@Param('slug') slug: string) {
    const found = this.procedures.get(slug);
    if (!found) throw new NotFoundException(`Unknown procedure: ${slug}`);
    return found;
  }
}
