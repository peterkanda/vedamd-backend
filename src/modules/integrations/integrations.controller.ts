import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import type { IntegrationCategory, IntegrationMethod } from './integrations.data';

@ApiTags('integrations')
@Controller('v1/integrations')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

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
