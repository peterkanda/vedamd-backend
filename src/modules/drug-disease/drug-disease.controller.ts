import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DrugDiseaseService } from './drug-disease.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('drug-disease')
@Controller('v1/drug-disease')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class DrugDiseaseController {
  constructor(private readonly dd: DrugDiseaseService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List drug-disease / drug-condition interactions',
    description:
      'Open catalogue of condition-based contraindications and cautions (e.g. NSAID in CKD, metformin in AKI, beta-blocker in asthma). Filters: drug (slug or name), condition (slug or name), severity (contraindicated|caution), q. Returns summaries; fetch full guidance by slug.',
  })
  list(
    @Query('drug') drug?: string,
    @Query('condition') condition?: string,
    @Query('severity') severity?: string,
    @Query('q') q?: string,
  ) {
    return { drugDisease: this.dd.list({ drug, condition, severity, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a drug-disease interaction by slug',
    description:
      'Returns the drug/class, condition, severity, mechanism, recommendation and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.dd.get(slug);
    if (!found) throw new NotFoundException(`Unknown drug-disease interaction: ${slug}`);
    return found;
  }
}
