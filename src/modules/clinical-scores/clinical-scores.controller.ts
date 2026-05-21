import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicalScoresService } from './clinical-scores.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('clinical-scores')
@Controller('v1/clinical-scores')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ClinicalScoresController {
  constructor(private readonly scores: ClinicalScoresService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List clinical scoring tools',
    description:
      'Open catalogue of validated scores (CHA2DS2-VASc, Wells, NEWS2, GCS, CURB-65, etc.). Filters: domain, q (free text over slug/title/abbreviation). Returns summaries; fetch full definition by slug.',
  })
  list(@Query('domain') domain?: string, @Query('q') q?: string) {
    return { clinicalScores: this.scores.list({ domain, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a clinical score definition by slug',
    description:
      'Returns purpose, scored items with points, scoring method, interpretation bands with suggested actions, and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.scores.get(slug);
    if (!found) throw new NotFoundException(`Unknown clinical score: ${slug}`);
    return found;
  }
}
