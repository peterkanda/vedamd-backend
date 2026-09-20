import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { PostmanCollectionService } from './postman-collection.service';
import { IntegrationMarkdownService } from './integration-markdown.service';
import { PluginDownloadsController } from './plugins/plugin-downloads.controller';
import { PluginPackagesService } from './plugins/plugin-packages.service';
import { DeveloperModule } from '../developer/developer.module';
import { CdsModule } from '../cds/cds.module';

/**
 * EMR / HMIS integration catalogue — plugin / snippet metadata for
 * OpenMRS, OpenEMR, Bahmni, ERPNext, GNU Health, DHIS2, OpenHIM,
 * CommCare, Epic, Cerner / Oracle Health, Allscripts / Veradigm,
 * athenahealth, plus standard targets (HL7 v2, FHIR R4, CDS Hooks 1.0,
 * SMART on FHIR). Static configuration, anonymous-by-design — no
 * patient data exchange happens at this endpoint.
 *
 * Downloadable plugin packages are served from
 * /api/v1/integrations/plugins (see plugins/plugin-downloads.controller.ts).
 *
 * Also exposes a Postman v2.1 collection generator at
 * /api/v1/integrations/postman-collection — pre-populated with every
 * CDS service the deployment exposes plus core content endpoints.
 */
@Module({
  imports: [DeveloperModule, CdsModule],
  // PluginDownloadsController is registered first so its static
  // `plugins` routes are declared ahead of the catalogue's `:slug` route.
  controllers: [PluginDownloadsController, IntegrationsController],
  providers: [
    IntegrationsService,
    PostmanCollectionService,
    IntegrationMarkdownService,
    PluginPackagesService,
  ],
  exports: [IntegrationsService, PluginPackagesService],
})
export class IntegrationsModule {}
