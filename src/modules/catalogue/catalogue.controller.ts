import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { CatalogueService } from './catalogue.service';

@ApiTags('catalogue')
@Controller('v1/catalogue')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('counts')
  @RequireScope('content:read')
  // Not @ImmutableContent: integrations and dose protocols ship with the
  // code, not the signed bundle, so a bundle-version ETag could go stale.
  @Header('cache-control', 'private, max-age=300')
  @ApiOperation({
    summary: 'Record count per catalogue domain',
    description:
      'The number of records each unfiltered list endpoint returns (conditions, drugs, scores, antidotes, …), in one small response.',
  })
  counts() {
    return { counts: this.catalogue.counts() };
  }
}
