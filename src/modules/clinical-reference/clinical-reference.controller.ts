import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ClinicalReferenceService, REFERENCE_DOMAINS } from './clinical-reference.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

/**
 * Unified clinical-reference domains: nursing care plans + procedures +
 * IPC + fluids (clinical-procedures), ECG/blood-gas/lab/imaging
 * (bedside-interpretation), contraception/stewardship/palliative/
 * counselling (preventive-care), and growth/development/screening
 * (growth-development). Reference content only, anonymous by design.
 */
@ApiTags('clinical-reference')
@Controller('v1/clinical-reference')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class ClinicalReferenceController {
  constructor(private readonly svc: ClinicalReferenceService) {}

  @Get(':domain')
  @RequireScope('content:read')
  @ApiParam({ name: 'domain', enum: REFERENCE_DOMAINS })
  @ApiOperation({
    summary: 'List reference cards in a clinical-reference domain',
    description:
      'domain ∈ clinical-procedures | bedside-interpretation | preventive-care | growth-development. Filters: category, q. Returns summaries; fetch full sections by slug.',
  })
  list(@Param('domain') domain: string, @Query('category') category?: string, @Query('q') q?: string) {
    if (!this.svc.isDomain(domain)) throw new BadRequestException(`Unknown reference domain: ${domain}`);
    return { domain, cards: this.svc.list(domain, { category, q }) };
  }

  @Get(':domain/:slug')
  @RequireScope('content:read')
  @ApiParam({ name: 'domain', enum: REFERENCE_DOMAINS })
  @ApiOperation({
    summary: 'Get a reference card by domain + slug',
    description:
      'Returns the full card: summary, titled sections (bullets or ordered steps), red flags and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('domain') domain: string, @Param('slug') slug: string) {
    if (!this.svc.isDomain(domain)) throw new BadRequestException(`Unknown reference domain: ${domain}`);
    const found = this.svc.get(domain, slug);
    if (!found) throw new NotFoundException(`Unknown ${domain} card: ${slug}`);
    return found;
  }
}
