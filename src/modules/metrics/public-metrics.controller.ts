import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsageService, type PublicMetrics } from '../usage/usage.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

interface PublicMetricsResponse extends PublicMetrics {
  bundleVersion: string;
  bundleRecords: number;
  bundleDomains: number;
}

/**
 * Public, unauthenticated metrics endpoint — feeds the marketing landing
 * page and external trust signals (uptime monitors, prospective partner
 * demos). All counts come from UsageService.publicMetrics(), which is
 * k-anonymised (suppresses counts under 5, rounds to {10, 100, 1000}).
 *
 * Why unauthenticated:
 * - We deliberately surface trust-building numbers (active users, CDS
 *   evaluations served) for prospective customers and the public.
 * - The output carries NO row content, NO route templates, NO actor
 *   data — only bucketed scalars.
 *
 * Cache-Control: 5 min. Heavy-hitter route from the marketing page —
 * the aggregation is cheap but caching protects the DB from bot scrapes.
 */
@ApiTags('metrics')
@Controller('v1/metrics')
export class PublicMetricsController {
  constructor(
    private readonly usage: UsageService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get('public')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=300')
  @ApiOperation({
    summary: 'Public, anonymised product metrics for marketing / trust signals.',
    description:
      'k-anonymised aggregate counts over a rolling 30-day window plus signed content-bundle stats. Safe to publish externally; no PII, no PHI, no route or actor data.',
  })
  async get(): Promise<PublicMetricsResponse> {
    const [metrics] = await Promise.all([this.usage.publicMetrics(30)]);
    const bundle = this.knowledge.getInfo();
    const totalRecords = bundle?.contentStats?.totalRecords ?? 0;
    const bundleDomains = bundle?.files?.length ?? 0;
    return {
      ...metrics,
      bundleVersion: bundle?.version ?? 'unknown',
      bundleRecords: totalRecords,
      bundleDomains,
    };
  }
}
