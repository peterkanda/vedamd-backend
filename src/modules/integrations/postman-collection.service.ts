import { Injectable } from '@nestjs/common';
import type { CdsServiceDescriptor } from '../cds/cds.types';

/**
 * Postman v2.1 collection generator.
 *
 * Produces a ready-to-import collection covering:
 *  - CDS Hooks discovery (GET /cds-services)
 *  - Every discovered CDS service as a POST with a realistic sample body
 *  - VedaMD core data endpoints (drugs, conditions, integrations, etc.)
 *  - Bearer auth pre-configured at the collection level
 *
 * Static, deterministic — no patient data, no PHI. Same shape Postman
 * (and Insomnia / Bruno via OpenAPI bridge) accepts as a 2.1 collection.
 *
 * @see https://schema.postman.com/collection/json/v2.1.0/draft-07/collection.json
 */
@Injectable()
export class PostmanCollectionService {
  build(opts: { baseUrl: string; services: CdsServiceDescriptor[] }): unknown {
    const { baseUrl, services } = opts;
    return {
      info: {
        name: 'VedaMD — Clinical Decision Support API',
        description: [
          'CDS Hooks 1.0 + FHIR R4-friendly clinical decision support endpoints from VedaMD.',
          '',
          'Set the `apiKey` collection variable to your sandbox key (`vmd_test_…`) or production key (`vmd_live_…`).',
          'Set `baseUrl` to your VedaMD deployment URL (default: ' + baseUrl + ').',
          '',
          'Generated automatically — re-download anytime from /api/v1/integrations/postman-collection.',
        ].join('\n'),
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }],
      },
      variable: [
        { key: 'baseUrl', value: baseUrl, type: 'string' },
        { key: 'apiKey', value: 'vmd_test_replace_me', type: 'string' },
      ],
      item: [
        {
          name: 'CDS Hooks',
          description: 'CDS Hooks 1.0 discovery + per-service invocation.',
          item: [
            {
              name: 'Discover services',
              request: {
                method: 'GET',
                header: [{ key: 'Accept', value: 'application/json' }],
                url: {
                  raw: '{{baseUrl}}/cds-services',
                  host: ['{{baseUrl}}'],
                  path: ['cds-services'],
                },
                description: 'Lists every CDS Hooks service this VedaMD deployment exposes.',
              },
              response: [],
            },
            ...services.map((s) => ({
              name: `${s.id}  (${s.hook})`,
              request: {
                method: 'POST',
                header: [
                  { key: 'Content-Type', value: 'application/json' },
                  { key: 'Accept', value: 'application/json' },
                ],
                body: {
                  mode: 'raw',
                  raw: JSON.stringify(sampleHookBody(s), null, 2),
                  options: { raw: { language: 'json' } },
                },
                url: {
                  raw: `{{baseUrl}}/cds-services/${s.id}`,
                  host: ['{{baseUrl}}'],
                  path: ['cds-services', s.id],
                },
                description: `${s.title}\n\n${s.description}`,
              },
              response: [],
            })),
          ],
        },
        {
          name: 'Content',
          description: 'Reference content — drugs, conditions, scores, antidotes, etc.',
          item: [
            simpleGet('Conditions — list', '/api/v1/conditions', { q: 'malaria' }),
            simpleGet('Condition — get one', '/api/v1/conditions/severe-malaria-child'),
            simpleGet('Drugs — list', '/api/v1/drugs', { q: 'amoxicillin' }),
            simpleGet('Drug — get one', '/api/v1/drugs/amoxicillin'),
            simpleGet('Clinical scores — list', '/api/v1/clinical-scores'),
            simpleGet('Antidotes — list', '/api/v1/antidotes'),
            simpleGet('Drug-disease interactions', '/api/v1/drug-disease', { severity: 'contraindicated' }),
            simpleGet('Immunisation schedule', '/api/v1/immunization-schedule'),
            simpleGet('Allergy cross-reactivity', '/api/v1/allergy-cross-reactivity'),
            simpleGet('Notifiable diseases', '/api/v1/notifiable-diseases'),
            simpleGet('Pharmacogenomics', '/api/v1/pharmacogenomics'),
            simpleGet('Reference ranges', '/api/v1/reference-ranges'),
          ],
        },
        {
          name: 'Integrations catalogue',
          description: 'EMR / HMIS plugin + snippet catalogue.',
          item: [
            simpleGet('Integrations — list', '/api/v1/integrations'),
            simpleGet('Integrations — filter open-source', '/api/v1/integrations', {
              category: 'open-source',
            }),
            simpleGet('Integrations — filter CDS Hooks method', '/api/v1/integrations', {
              method: 'cds-hooks',
            }),
            simpleGet('Integration — get OpenMRS', '/api/v1/integrations/openmrs'),
            simpleGet('Integration — get Epic', '/api/v1/integrations/epic'),
            simpleGet('Integration — get DHIS2', '/api/v1/integrations/dhis2'),
          ],
        },
        {
          name: 'Agentic CDS',
          description: 'Reasoning-layer decision support with optional LLM.',
          item: [
            {
              name: 'Evaluate (deterministic)',
              request: {
                method: 'POST',
                header: [{ key: 'Content-Type', value: 'application/json' }],
                body: {
                  mode: 'raw',
                  raw: JSON.stringify(
                    {
                      mode: 'deterministic',
                      context: {
                        question: 'Is metformin safe in this patient?',
                        medications: ['metformin'],
                        diagnoses: ['type-2-diabetes', 'ckd-stage-4'],
                        eGFR: 25,
                      },
                    },
                    null,
                    2,
                  ),
                  options: { raw: { language: 'json' } },
                },
                url: {
                  raw: '{{baseUrl}}/api/v1/agentic/evaluate',
                  host: ['{{baseUrl}}'],
                  path: ['api', 'v1', 'agentic', 'evaluate'],
                },
                description: 'Deterministic safety floor — works offline, no LLM required.',
              },
              response: [],
            },
          ],
        },
      ],
    };
  }
}

function simpleGet(name: string, path: string, query: Record<string, string> = {}) {
  const parts = path.split('/').filter(Boolean);
  return {
    name,
    request: {
      method: 'GET',
      header: [{ key: 'Accept', value: 'application/json' }],
      url: {
        raw: `{{baseUrl}}${path}${qs(query)}`,
        host: ['{{baseUrl}}'],
        path: parts,
        ...(Object.keys(query).length
          ? { query: Object.entries(query).map(([key, value]) => ({ key, value })) }
          : {}),
      },
    },
    response: [],
  };
}

function qs(q: Record<string, string>): string {
  const entries = Object.entries(q);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function sampleHookBody(s: CdsServiceDescriptor): unknown {
  const baseContext: Record<string, unknown> = { patientId: 'example-patient-123' };
  if (s.hook === 'medication-prescribe' || s.hook === 'order-select' || s.hook === 'order-sign') {
    baseContext.encounterId = 'example-encounter-456';
    baseContext.medications = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'MedicationRequest',
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: {
              coding: [
                {
                  system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                  code: '29046',
                  display: 'Lisinopril 10 MG Oral Tablet',
                },
              ],
            },
          },
        },
      ],
    };
  }
  return {
    hook: s.hook,
    hookInstance: '01HVZ7X9K8YR1AB3CD4EF5GH6J',
    fhirServer: 'https://your-ehr.example/fhir/R4',
    context: baseContext,
  };
}
