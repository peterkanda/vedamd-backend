import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PregnancyLactationService } from './pregnancy-lactation.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('pregnancy-lactation')
@Controller('v1/pregnancy-lactation')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class PregnancyLactationController {
  constructor(private readonly svc: PregnancyLactationService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List pregnancy + lactation reference records (PLLR format)',
    description:
      '2015 FDA PLLR structured-narrative format + LactMed-style lactation detail. Each record is keyed by drug slug and carries a clinical headline + risk summary + clinical considerations + data + reproductive-potential guidance. The retired A/B/C/D/X letter categories are stored for back-compat but should NOT be the primary decision aid. Filters: q (free text), pregnancy / lactation (preferred|acceptable|caution|avoid|contraindicated).',
  })
  list(
    @Query('q') q?: string,
    @Query('pregnancy') pregnancy?: string,
    @Query('lactation') lactation?: string,
  ) {
    return { records: this.svc.list({ q, pregnancy, lactation }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a pregnancy + lactation record by slug',
    description:
      'Returns the full PLLR narrative: pregnancy (risk summary, clinical considerations, data, trimester notes), lactation (risk summary, infant exposure data, alternatives), reproductive potential (pregnancy testing, contraception, infertility), and citations.',
  })
  get(@Param('slug') slug: string) {
    const found = this.svc.get(slug);
    if (!found) throw new NotFoundException(`Unknown pregnancy-lactation record: ${slug}`);
    return found;
  }

  @Get('by-drug/:drugSlug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Reverse lookup by drug slug',
    description:
      'For an integrator that has the drug slug (e.g. from a prescription) and wants the PLLR record directly. Returns 404 if no PLLR record exists for that drug.',
  })
  getByDrug(@Param('drugSlug') drugSlug: string) {
    const found = this.svc.getByDrugSlug(drugSlug);
    if (!found)
      throw new NotFoundException(`No PLLR record for drug slug: ${drugSlug}`);
    return found;
  }
}
