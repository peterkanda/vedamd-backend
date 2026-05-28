import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HepaticDoseService } from './hepatic-dose.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('hepatic-dose')
@Controller('v1/hepatic-dose')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class HepaticDoseController {
  constructor(private readonly svc: HepaticDoseService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List hepatic dose adjustment records (Child-Pugh-banded)',
    description:
      'Structured-axis hepatic dose adjustment, mirroring the renal adjustment pattern. Each record carries per-Child-Pugh-class guidance (A=mild, B=moderate, C=severe), mechanism, monitoring, acute-failure considerations, and practical alternatives. Filters: q (free text), decision (use-with-caution|reduce-dose|avoid|contraindicated).',
  })
  list(@Query('q') q?: string, @Query('decision') decision?: string) {
    return { records: this.svc.list({ q, decision }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a hepatic dose adjustment record by slug',
    description:
      'Returns full Child-Pugh A/B/C guidance, mechanism, monitoring, acute-failure considerations and alternatives.',
  })
  get(@Param('slug') slug: string) {
    const found = this.svc.get(slug);
    if (!found) throw new NotFoundException(`Unknown hepatic-dose record: ${slug}`);
    return found;
  }

  @Get('by-drug/:drugSlug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Reverse lookup by drug slug',
    description:
      'For an integrator with the drug slug (e.g. from a prescription) — returns the hepatic dose record directly. 404 if no record exists for that drug.',
  })
  getByDrug(@Param('drugSlug') drugSlug: string) {
    const found = this.svc.getByDrugSlug(drugSlug);
    if (!found) throw new NotFoundException(`No hepatic-dose record for drug slug: ${drugSlug}`);
    return found;
  }
}
