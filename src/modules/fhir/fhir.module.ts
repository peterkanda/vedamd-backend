import { Module } from '@nestjs/common';
import { FhirService } from './fhir.service';

/**
 * SRS §6.3.5 — FHIR Context Adapter (Stateless, Request-Scoped).
 *
 * VedaMD is NOT a FHIR server (FR-089). This module exists for two
 * narrow purposes:
 *
 *   1. **Pattern B callback** (SRS §4.4) — when the integrator's
 *      prefetch is incomplete, the CDS Hooks request includes
 *      `fhirServer` + `fhirAuthorization` and we call back to the
 *      integrator's OWN FHIR server for missing resources. Those
 *      resources live only in request-scoped memory and are released
 *      after the response (FR-088).
 *
 *   2. **Validation** of inbound FHIR resources arriving in CDS Hooks
 *      payloads or REST evaluate bodies, against declared profiles
 *      (FR-082, FR-085).
 *
 * Negative requirements enforced here:
 *   - FR-088: SHALL NOT persist any inbound FHIR resource
 *   - FR-089: SHALL NOT operate a persistent FHIR server
 *   - FR-090: SHALL NOT support FHIR mutation operations on patient resources
 */
@Module({
  providers: [FhirService],
  exports: [FhirService],
})
export class FhirModule {}
