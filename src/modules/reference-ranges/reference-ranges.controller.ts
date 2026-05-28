import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReferenceRangesService } from './reference-ranges.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('reference-ranges')
@Controller('v1/reference-ranges')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ReferenceRangesController {
  constructor(private readonly ranges: ReferenceRangesService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List laboratory and vital-sign reference ranges',
    description:
      'Open catalogue of typical adult reference intervals (UCUM units) for labs and vital signs. Filters: category (electrolytes, renal, liver, haematology, vital-signs, etc.), q. Local laboratory/method-specific ranges always take precedence. Returns summaries; fetch full range by slug.',
  })
  list(@Query('category') category?: string, @Query('q') q?: string) {
    return { referenceRanges: this.ranges.list({ category, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a reference range by slug',
    description:
      'Returns the analyte, specimen, low/high bounds, UCUM unit, sex applicability, notes and source caveat. Reference content only — no patient identity or result is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.ranges.get(slug);
    if (!found) throw new NotFoundException(`Unknown reference range: ${slug}`);
    return found;
  }
}
