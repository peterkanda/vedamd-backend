import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BundlesService } from './bundles.service';

@ApiTags('bundles')
@Controller('v1/bundles')
export class BundlesController {
  constructor(private readonly bundles: BundlesService) {}

  @Get()
  @ApiOperation({
    summary: 'Catalog of signed knowledge bundles',
    description: 'FR-147 — filter by domain, locale, country applicability.',
  })
  catalog(
    @Query('domain') domain?: string,
    @Query('locale') locale?: string,
    @Query('country') country?: string,
  ) {
    return this.bundles.catalog({ domain, locale, country });
  }

  @Get(':id/latest')
  @ApiOperation({ summary: 'Latest bundle metadata for an id' })
  latest(@Param('id') id: string) {
    return this.bundles.latest(id);
  }
}
