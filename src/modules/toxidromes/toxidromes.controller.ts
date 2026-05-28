import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ToxidromesService } from './toxidromes.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('toxidromes')
@Controller('v1/toxidromes')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ToxidromesController {
  constructor(private readonly toxidromes: ToxidromesService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List toxidromes (poisoning pattern recognition)',
    description:
      'Open toxidrome reference: pattern → likely class of poisoning, with management and links to antidote records where applicable. Covers anticholinergic, cholinergic (SLUDGE / organophosphate), opioid, sympathomimetic, sedative-hypnotic, serotonin syndrome, NMS, salicylate. Filters: q (free text), domain. Returns summaries; fetch full details by slug.',
  })
  list(@Query('q') q?: string, @Query('domain') domain?: string) {
    return { toxidromes: this.toxidromes.list({ q, domain }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a toxidrome by slug',
    description:
      'Returns the full pattern: vital signs, exam findings, common causative agents, differential diagnosis, ordered management steps, antidote (where one exists, with link to the antidote record), and red flags. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.toxidromes.get(slug);
    if (!found) throw new NotFoundException(`Unknown toxidrome: ${slug}`);
    return found;
  }
}
