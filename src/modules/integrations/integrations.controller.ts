import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IntegrationsService } from './integrations.service';
import { PostmanCollectionService } from './postman-collection.service';
import { CdsService } from '../cds/cds.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import type { IntegrationCategory, IntegrationMethod } from './integrations.data';

@ApiTags('integrations')
@Controller('v1/integrations')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly postman: PostmanCollectionService,
    private readonly cds: CdsService,
  ) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List EMR / HMIS integrations VedaMD supports',
    description:
      'Catalogue of plugin / snippet integrations for OpenMRS, OpenEMR, Bahmni, ERPNext, GNU Health, DHIS2, OpenHIM, CommCare, Epic, Cerner / Oracle Health, Allscripts / Veradigm, athenahealth, plus pure-standard targets (HL7 v2, FHIR R4, CDS Hooks 1.0, SMART on FHIR). Filter by category (open-source / proprietary / standard), method (cds-hooks, smart-on-fhir, fhir-rest, rest, hl7v2, webhook, iframe-embed) or free-text query. Returns summaries; fetch detailed snippets + links by slug.',
  })
  list(
    @Query('category') category?: IntegrationCategory,
    @Query('method') method?: IntegrationMethod,
    @Query('q') q?: string,
  ) {
    return { integrations: this.integrations.list({ category, method, q }) };
  }

  @Get('postman-collection')
  @RequireScope('content:read')
  @Header('content-type', 'application/json')
  @Header(
    'content-disposition',
    'attachment; filename="vedamd-postman-collection.json"',
  )
  @ApiOperation({
    summary: 'Download a Postman v2.1 collection for the API',
    description:
      'Generates a ready-to-import Postman v2.1 collection covering CDS Hooks discovery, every discovered CDS service (POST with realistic sample body), core content endpoints (drugs, conditions, scores, antidotes, ranges, drug-disease, immunization, allergy, notifiable, pgx), the integrations catalogue itself, and a deterministic agentic evaluate example. Bearer auth is pre-configured at the collection level — set the `apiKey` variable to your sandbox or production key after import. Also imports cleanly into Insomnia (via the Postman importer) and Bruno.',
  })
  postmanCollection(@Req() req: FastifyRequest) {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'api.vedamd.io';
    const baseUrl = `${proto}://${host}`;
    return this.postman.build({ baseUrl, services: this.cds.listServices() });
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an EMR / HMIS integration detail by slug',
    description:
      'Returns description, supported CDS hooks, copy-paste configuration snippets, plugin / documentation links and integrator notes for the requested system.',
  })
  get(@Param('slug') slug: string) {
    const found = this.integrations.get(slug);
    if (!found) throw new NotFoundException(`Unknown integration: ${slug}`);
    return found;
  }
}
