import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('knowledge')
@Controller('v1/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly search: KnowledgeSearchService,
  ) {}

  @Get('bundle')
  @ApiOperation({
    summary: 'Return the loaded content bundle metadata',
    description:
      'Unauthenticated by design — auditors and integrators can verify which signed content bundle the platform is serving (version, signer, signedAt, per-file SHA-256, verification status). No clinical content is returned here.',
  })
  bundle() {
    return this.knowledge.getInfo();
  }

  @Get('search')
  @UseGuards(ApiKeyGuard)
  @RequireScope('content:read')
  @ApiBearerAuth()
  @ApiQuery({ name: 'q', required: true, description: 'Search term (≥ 2 chars).' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max hits (default 40, capped 100).' })
  @ApiOperation({
    summary: 'Unified search across every content domain in the signed bundle',
    description:
      'Searches conditions, drugs, scores, antidotes, toxidromes, symptom-triage, pregnancy-lactation, hepatic-dose, reference-ranges, pharmacogenomics, allergy, notifiable, immunization, drug-disease, IV-compatibility, anticoagulant-reversal and procedures in one call. Returns route-addressable hits { domain, slug, title, route, snippet } the UI renders as a single "In VedaMD" result group. Anonymous + read-only; no PHI.',
  })
  searchContent(@Query('q') q: string, @Query('limit') limit?: string) {
    const n = limit ? Math.max(1, Math.min(parseInt(limit, 10) || 40, 100)) : 40;
    return { query: q ?? '', results: this.search.search(q ?? '', n) };
  }
}
