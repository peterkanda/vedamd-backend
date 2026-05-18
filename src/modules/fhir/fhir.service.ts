import { Injectable } from '@nestjs/common';
import { MedplumClient } from '@medplum/core';

/**
 * Stateless FHIR client.
 *
 * Used to call BACK to an integrator's own FHIR server when their
 * prefetch is incomplete (CDS Hooks "Pattern B" — see SRS §4.4).
 * This service never points at a VedaMD-hosted FHIR endpoint, because
 * none exists (FR-089).
 *
 * Resources fetched through this client live only in the request-scoped
 * caller's memory. The client itself holds no state about patients
 * across requests.
 */
@Injectable()
export class FhirService {
  /**
   * Construct a request-scoped FHIR client against the integrator's
   * FHIR server, using the bearer token the integrator authorized for
   * this single CDS Hooks invocation.
   */
  clientFor(fhirServerBaseUrl: string, bearerToken?: string): MedplumClient {
    const client = new MedplumClient({
      baseUrl: fhirServerBaseUrl,
      fetch: globalThis.fetch,
    });
    if (bearerToken) client.setAccessToken(bearerToken);
    return client;
  }
}
