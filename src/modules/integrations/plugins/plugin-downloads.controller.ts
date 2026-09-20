import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiKeyGuard, RequireScope } from '../../../common/api-key-auth';
import { PluginPackagesService, type PluginPackage } from './plugin-packages.service';

/**
 * Downloadable EMR plugin packages.
 *
 * Deliberately NOT under @ImmutableContent like the rest of the
 * integrations catalogue. That cache keys its ETag on the content
 * bundle version, not the response body, and marks responses immutable
 * — so a fixed plugin shipped without a bundle bump would keep being
 * served from browser and CDN caches in its broken form. Here the ETag
 * is the archive's own SHA-256 and clients must revalidate.
 *
 * Fastify matches the static "plugins" segment ahead of the catalogue's
 * `v1/integrations/:slug` route, so the two controllers do not collide.
 */
@ApiTags('integrations')
@Controller('v1/integrations/plugins')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class PluginDownloadsController {
  constructor(private readonly packages: PluginPackagesService) {}

  @Get()
  @RequireScope('content:read')
  @Header('cache-control', 'no-cache')
  @ApiOperation({
    summary: 'List downloadable EMR plugin packages',
    description:
      'Installable packages for OpenMRS/Bahmni, OpenEMR, Frappe Health, GNU Health, DHIS2, the CDS bridge and Epic/Oracle Health onboarding. Each entry carries version, size, SHA-256 and install instructions. Filter with ?integration=<catalogue slug>.',
  })
  list(@Query('integration') integration?: string): { plugins: PluginPackage[] } {
    return {
      plugins: integration ? this.packages.forIntegration(integration) : this.packages.list(),
    };
  }

  @Get(':id/download')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Download a plugin package (zip)',
    description:
      'Returns the archive bytes. Verify them against the X-Content-SHA256 header or the sha256 in the package list before installing.',
  })
  download(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): StreamableFile | undefined {
    const found = this.packages.get(id);
    if (!found) throw new NotFoundException(`Unknown plugin package: ${id}`);

    const etag = `"${found.meta.sha256}"`;
    reply.header('etag', etag);
    reply.header('cache-control', 'no-cache');
    reply.header('x-content-sha256', found.meta.sha256);

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
      reply.code(304);
      return undefined;
    }

    return new StreamableFile(found.bytes, {
      type: 'application/zip',
      disposition: `attachment; filename="${found.meta.fileName}"`,
      length: found.bytes.length,
    });
  }
}
