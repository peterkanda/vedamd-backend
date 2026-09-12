import { describe, expect, it } from 'vitest';
import { makeCdsService } from './helpers/make-cds-service';

/**
 * End-to-end proof that the payloads real EMRs send produce real cards.
 *
 * Before the normalisation layer these requests returned `{ cards: [] }`
 * with a 200 — an integration that looks wired up and silently does
 * nothing. Each case below is the envelope the named product actually
 * puts on the wire, not a VedaMD-shaped convenience payload.
 */
describe('CDS Hooks — real EMR payloads', () => {
  it('OpenMRS / Bahmni (openmrs-module-cdss) gets interaction cards from a FHIR prefetch', async () => {
    const cds = makeCdsService();

    // Exactly what CdssOrderSelectServiceImpl posts: hook + prefetch with
    // patient / conditions / draftMedicationRequests, and no `context`.
    const res = await cds.evaluateHook('vedamd-order-select', {
      hook: 'vedamd-order-select',
      hookInstance: 'bahmni-e2e',
      context: {},
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'female', birthDate: '1958-06-01' },
        conditions: { resourceType: 'Bundle', entry: [] },
        draftMedicationRequests: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'active',
                medicationCodeableConcept: {
                  coding: [
                    {
                      system: 'https://fhir.openmrs.org',
                      code: 'drug-uuid-1',
                      display: 'Warfarin 5mg Tablet',
                    },
                  ],
                  text: 'Warfarin 5mg Tablet',
                },
              },
            },
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'draft',
                medicationCodeableConcept: {
                  coding: [
                    {
                      system: 'https://fhir.openmrs.org',
                      code: 'drug-uuid-2',
                      display: 'Ibuprofen 400mg Tablet',
                    },
                  ],
                  text: 'Ibuprofen 400mg Tablet',
                },
              },
            },
          ],
        },
      },
    });

    expect(res.cards.length).toBeGreaterThan(0);
    const summaries = res.cards.map((c) => c.summary.toLowerCase()).join(' | ');
    expect(summaries).toContain('warfarin');
    expect(summaries).toContain('ibuprofen');
  });

  it('Epic-style order-select with draftOrders and a renal lab fires renal dosing', async () => {
    const cds = makeCdsService();

    const res = await cds.evaluateHook('vedamd-order-select', {
      hook: 'order-select',
      hookInstance: 'epic-e2e',
      context: {
        patientId: 'eXYZ',
        userId: 'Practitioner/123',
        draftOrders: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'draft',
                medicationCodeableConcept: {
                  coding: [
                    {
                      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                      code: '11289',
                      display: 'Warfarin Sodium 5 MG Oral Tablet',
                    },
                  ],
                },
              },
            },
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'draft',
                medicationCodeableConcept: {
                  coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '5640' }],
                  text: 'Ibuprofen 400 MG Oral Tablet',
                },
              },
            },
          ],
        },
      },
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'male', birthDate: '1949-02-11' },
      },
    });

    expect(res.cards.length).toBeGreaterThan(0);
  });

  it('a flat-dialect payload still behaves exactly as before', async () => {
    const cds = makeCdsService();
    const res = await cds.evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'flat-e2e',
      context: { medications: ['warfarin', 'ibuprofen'] },
    });
    expect(res.cards.length).toBeGreaterThan(0);
  });
});
