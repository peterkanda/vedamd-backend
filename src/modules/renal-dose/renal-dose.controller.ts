import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RenalDoseService } from './renal-dose.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('renal-dose')
@Controller('v1/renal-dose')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class RenalDoseController {
  constructor(private readonly svc: RenalDoseService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List renal dose adjustment records (eGFR-banded)',
    description:
      'Structured-axis renal dose adjustment, mirroring the hepatic adjustment pattern. Each record carries per-eGFR-band guidance (normal ≥90, mild 60-89, moderate 30-59, severe 15-29, esrd <15 mL/min/1.73m²), mechanism, monitoring, AKI considerations, dialyzability, dialysis dosing, and practical alternatives. Filters: q (free text), decision (use-with-caution|reduce-dose|avoid|contraindicated).',
  })
  list(@Query('q') q?: string, @Query('decision') decision?: string) {
    return { records: this.svc.list({ q, decision }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a renal dose adjustment record by slug',
    description:
      'Returns full per-eGFR-band guidance, mechanism, monitoring, AKI considerations, dialyzability, dialysis dosing and alternatives.',
  })
  get(@Param('slug') slug: string) {
    const found = this.svc.get(slug);
    if (!found) throw new NotFoundException(`Unknown renal-dose record: ${slug}`);
    return found;
  }

  @Get('by-drug/:drugSlug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Reverse lookup by drug slug',
    description:
      'For an integrator with the drug slug (e.g. from a prescription) — returns the renal dose record directly. 404 if no record exists for that drug.',
  })
  getByDrug(@Param('drugSlug') drugSlug: string) {
    const found = this.svc.getByDrugSlug(drugSlug);
    if (!found) throw new NotFoundException(`No renal-dose record for drug slug: ${drugSlug}`);
    return found;
  }
}
