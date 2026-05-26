import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { PostmanCollectionService } from './postman-collection.service';
import { IntegrationMarkdownService } from './integration-markdown.service';
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
 * Also exposes a Postman v2.1 collection generator at
 * /api/v1/integrations/postman-collection — pre-populated with every
 * CDS service the deployment exposes plus core content endpoints.
 */
@Module({
  imports: [DeveloperModule, CdsModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, PostmanCollectionService, IntegrationMarkdownService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
