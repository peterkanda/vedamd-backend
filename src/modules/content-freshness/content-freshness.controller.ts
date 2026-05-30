import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ContentFreshnessService } from './content-freshness.service';

/**
 * GET surfaces the latest weekly content-freshness report; POST forces
 * a re-run for ops / dashboards. Both routes scope-gated as
 * `content:read` so they fit the same vocabulary already used by the
 * knowledge / drugs / conditions read endpoints.
 */
@ApiTags('content')
@Controller('v1/content-freshness')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ContentFreshnessController {
  constructor(private readonly svc: ContentFreshnessService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get the latest content-freshness review queue',
    description:
      "Records whose newest cited source is older than the staleness threshold (five years) or carries no parseable date are listed here as the content team's review backlog. The audit runs at boot and weekly via setInterval — call POST to re-run on demand.",
  })
  get() {
    return this.svc.get() ?? this.svc.runAudit();
  }

  @Post('refresh')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Force a re-run of the freshness audit.' })
  refresh() {
    return this.svc.runAudit();
  }
}
