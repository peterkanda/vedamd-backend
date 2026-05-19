import { Module } from '@nestjs/common';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';

/**
 * SRS §6.3.3 — Terminology Service.
 * FHIR R4 terminology capability over ICD-10/11, LOINC, SNOMED GPS/CIEL,
 * RxNorm, ATC, AWaRe, KEML, local concept dictionary.
 */
@Module({
  controllers: [TerminologyController],
  providers: [TerminologyService],
  exports: [TerminologyService],
})
export class TerminologyModule {}
