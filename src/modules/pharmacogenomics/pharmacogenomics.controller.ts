import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PharmacogenomicsService } from './pharmacogenomics.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('pharmacogenomics')
@Controller('v1/pharmacogenomics')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class PharmacogenomicsController {
  constructor(private readonly pgx: PharmacogenomicsService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List pharmacogenomic gene-drug guidance',
    description:
      'Open CPIC-style catalogue (HLA-B*57:01-abacavir, TPMT/NUDT15-thiopurines, CYP2C19-clopidogrel, DPYD-fluoropyrimidines, G6PD-oxidants, etc.). Filters: gene, drug, q. Returns summaries; fetch full phenotype guidance by slug.',
  })
  list(@Query('gene') gene?: string, @Query('drug') drug?: string, @Query('q') q?: string) {
    return { pharmacogenomics: this.pgx.list({ gene, drug, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a gene-drug pharmacogenomic guideline by slug',
    description:
      'Returns the keyed variant, clinical summary, phenotype-based implications and recommendations (with strength), testing guidance and citations. Reference content only — no patient genotype or identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.pgx.get(slug);
    if (!found) throw new NotFoundException(`Unknown pharmacogenomic guideline: ${slug}`);
    return found;
  }
}
