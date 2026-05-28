import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllergyService } from './allergy.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('allergy-cross-reactivity')
@Controller('v1/allergy-cross-reactivity')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class AllergyController {
  constructor(private readonly allergy: AllergyService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List drug allergy cross-reactivity entries',
    description:
      'Open catalogue of drug allergy cross-reactivity, including common myths to dispel (e.g. penicillin-cephalosporin, sulfonamide antibiotic vs diuretics, contrast vs shellfish). Filters: drug (slug or name), risk (high|moderate|low|negligible), q. Returns summaries; fetch full guidance by slug.',
  })
  list(@Query('drug') drug?: string, @Query('risk') risk?: string, @Query('q') q?: string) {
    return { allergyCrossReactivity: this.allergy.list({ drug, risk, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an allergy cross-reactivity entry by slug',
    description:
      'Returns the allergen, what it does (or does not) cross-react with, the risk level, mechanism, recommendation, related drug slugs and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.allergy.get(slug);
    if (!found) throw new NotFoundException(`Unknown allergy cross-reactivity entry: ${slug}`);
    return found;
  }
}
