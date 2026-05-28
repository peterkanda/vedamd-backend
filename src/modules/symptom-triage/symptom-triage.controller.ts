import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SymptomTriageService } from './symptom-triage.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('symptom-triage')
@Controller('v1/symptom-triage')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class SymptomTriageController {
  constructor(private readonly svc: SymptomTriageService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List chief complaints with ranked differentials',
    description:
      'Backward-chaining differential-diagnosis reference. The clinician asks "what could this be?" — the record returns common / consider / must-not-miss bands, key history + exam, red flags, initial investigations, and disposition. Anonymous; reference-only. Filters: q (free text), population (adult|paediatric|all-ages), domain.',
  })
  list(
    @Query('q') q?: string,
    @Query('population') population?: string,
    @Query('domain') domain?: string,
  ) {
    return { records: this.svc.list({ q, population, domain }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a chief-complaint workup by slug',
    description:
      'Returns the full workup: framing, key history, key exam, ranked differential (common / consider / must-not-miss with discriminating features), red flags, initial investigations, and disposition.',
  })
  get(@Param('slug') slug: string) {
    const found = this.svc.get(slug);
    if (!found) throw new NotFoundException(`Unknown symptom-triage record: ${slug}`);
    return found;
  }
}
