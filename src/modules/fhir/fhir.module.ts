import { Module } from '@nestjs/common';
import { FhirService } from './fhir.service';

/**
 * SRS §6.3.5 — Patient Context / FHIR Adapter.
 * v0.1 delegates the FHIR R4/R5 server to Medplum and exposes a client here;
 * adapters for KenyaEMR, OpenMRS, DHIS2, CHT land in later milestones.
 */
@Module({
  providers: [FhirService],
  exports: [FhirService],
})
export class FhirModule {}
