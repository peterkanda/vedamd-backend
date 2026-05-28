import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImmunizationService } from './immunization.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('immunization')
@Controller('v1/immunization-schedule')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ImmunizationController {
  constructor(private readonly immunization: ImmunizationService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List WHO EPI immunization schedule entries',
    description:
      'Open routine immunization schedule (BCG, HepB, pentavalent, OPV/IPV, PCV, rotavirus, measles/MR, HPV, Td, yellow fever, MenA, etc.). Filters: disease, q. Returns summaries; fetch full dose schedule by slug.',
  })
  list(@Query('disease') disease?: string, @Query('q') q?: string) {
    return { immunizationSchedule: this.immunization.list({ disease, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an immunization schedule entry by slug',
    description:
      'Returns target diseases, dose timings and routes, target population, catch-up guidance, notes and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.immunization.get(slug);
    if (!found) throw new NotFoundException(`Unknown immunization schedule entry: ${slug}`);
    return found;
  }
}
