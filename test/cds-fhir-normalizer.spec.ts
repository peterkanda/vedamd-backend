import { describe, expect, it } from 'vitest';
import {
  DrugCodeIndex,
  deriveConditionSentinels,
} from '../src/modules/cds/normalize/code-resolver';
import { normalizeCdsRequest } from '../src/modules/cds/normalize/fhir-normalizer';
import { convert, LOINC_MAP } from '../src/modules/cds/normalize/observation-map';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

/**
 * A small drug index standing in for the signed bundle. Deliberately
 * includes a trade name and a two-word molecule so the name matcher's
 * precedence rules are exercised.
 */
const index = new DrugCodeIndex([
  {
    slug: 'warfarin',
    inn: 'Warfarin',
    tradeNames: ['Coumadin'],
    atc: ['B01AA03'],
    rxnorm: '11289',
  },
  {
    slug: 'amoxicillin',
    inn: 'Amoxicillin',
    tradeNames: ['Amoxil'],
    atc: ['J01CA04'],
    rxnorm: '723',
  },
  {
    slug: 'amoxicillin-clavulanate',
    inn: 'Amoxicillin/clavulanate',
    tradeNames: ['Augmentin'],
    atc: ['J01CR02'],
  },
  { slug: 'ibuprofen', inn: 'Ibuprofen', tradeNames: ['Brufen'], atc: ['M01AE01'], rxnorm: '5640' },
  { slug: 'codeine', inn: 'Codeine', tradeNames: [], atc: ['R05DA04'] },
]);

function normalize(req: CdsHookRequest) {
  return normalizeCdsRequest(req, { drugs: index, now: () => new Date('2026-09-12T00:00:00Z') });
}

describe('DrugCodeIndex', () => {
  it('resolves by RxNorm, ATC and SNOMED code', () => {
    expect(
      index.resolve({
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '11289' }],
      }),
    ).toBe('warfarin');
    expect(index.resolve({ coding: [{ system: 'http://whocc.no/atc', code: 'J01CA04' }] })).toBe(
      'amoxicillin',
    );
  });

  it('resolves an OpenMRS-style concept coding by its display text', () => {
    // openmrs-module-cdss sends the drug UUID under https://fhir.openmrs.org
    // with the dispensing name as `display` — the code itself is local and
    // meaningless to us, so the display must carry the match.
    expect(
      index.resolve({
        coding: [
          {
            system: 'https://fhir.openmrs.org',
            code: '2c4e1d5a-9f3b-4c8e-8a1d-000000000001',
            display: 'Amoxicillin 500mg Capsule',
          },
        ],
        text: 'Amoxicillin 500mg Capsule',
      }),
    ).toBe('amoxicillin');
  });

  it('prefers the longer molecule name over its prefix', () => {
    expect(index.resolveName('Amoxicillin/clavulanate 625mg tablet')).toBe(
      'amoxicillin-clavulanate',
    );
    expect(index.resolveName('Amoxicillin 250mg/5ml suspension')).toBe('amoxicillin');
  });

  it('does not match a drug name embedded mid-string', () => {
    // "Co-codamol" contains "codeine" nowhere, but a naive substring scan
    // over combination-product text is exactly how false positives appear.
    expect(index.resolveName('patient reports no codeine allergy')).toBeNull();
    expect(index.resolveName('Unknown herbal preparation')).toBeNull();
  });
});

describe('unit conversion', () => {
  it('converts creatinine mg/dL to µmol/L', () => {
    // 1.2 mg/dL is a normal-ish creatinine; read as µmol/L it would look
    // like profound renal failure and fire the wrong dosing card.
    expect(convert(LOINC_MAP['2160-0'], 1.2, 'mg/dl')).toBeCloseTo(106.08, 1);
    expect(convert(LOINC_MAP['2160-0'], 106, 'umol/l')).toBe(106);
  });

  it('converts glucose mg/dL to mmol/L and Fahrenheit to Celsius', () => {
    expect(convert(LOINC_MAP['2345-7'], 180, 'mg/dl')).toBeCloseTo(9.99, 1);
    expect(convert(LOINC_MAP['8310-5'], 101.3, '[degf]')).toBeCloseTo(38.5, 1);
  });

  it('drops values in an unrecognised unit rather than guessing', () => {
    expect(convert(LOINC_MAP['2160-0'], 1.2, 'banana')).toBeNull();
    expect(convert(LOINC_MAP['2160-0'], 1.2, '')).toBeNull();
  });

  it('drops physiologically impossible values', () => {
    expect(convert(LOINC_MAP['8480-6'], 900, 'mm[hg]')).toBeNull();
    expect(convert(LOINC_MAP['718-7'], 0.2, 'g/dl')).toBeNull();
  });
});

describe('normalizeCdsRequest — OpenMRS / Bahmni payload', () => {
  // The exact envelope openmrs-module-cdss posts: hook + prefetch with
  // patient, conditions and draftMedicationRequests. No `context` at all.
  const bahmniRequest: CdsHookRequest = {
    hook: 'vedamd-order-select',
    hookInstance: 'bahmni-1',
    context: {},
    prefetch: {
      patient: {
        resourceType: 'Patient',
        gender: 'female',
        birthDate: '1980-03-04',
      },
      conditions: {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'Condition',
              code: {
                coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'I48.0' }],
                text: 'Atrial fibrillation',
              },
            },
          },
        ],
      },
      draftMedicationRequests: {
        resourceType: 'Bundle',
        entry: [
          {
            resource: {
              resourceType: 'MedicationRequest',
              status: 'draft',
              medicationCodeableConcept: {
                coding: [
                  {
                    system: 'https://fhir.openmrs.org',
                    code: 'uuid-ibuprofen',
                    display: 'Ibuprofen 400mg Tablet',
                  },
                ],
                text: 'Ibuprofen 400mg Tablet',
              },
            },
          },
          {
            resource: {
              resourceType: 'MedicationRequest',
              status: 'active',
              medicationCodeableConcept: {
                coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '11289' }],
                text: 'Warfarin 5mg',
              },
            },
          },
        ],
      },
    },
  };

  it('produces the flat context the strategies read', () => {
    const { request, report } = normalize(bahmniRequest);
    const ctx = request.context;

    expect(report.applied).toBe(true);
    expect(ctx.sex).toBe('female');
    expect(ctx.ageYears).toBe(46);
    expect(ctx.diagnoses).toEqual(['atrial fibrillation']);
    expect(ctx.hasAtrialFibrillation).toBe(true);
    // Both drugs land in `medications` — the DDI strategy needs the pair
    // in one list to see the warfarin/ibuprofen bleeding interaction.
    expect(ctx.medications).toEqual(expect.arrayContaining(['ibuprofen', 'warfarin']));
    expect(report.resourcesSeen.MedicationRequest).toBe(2);
  });

  it('splits draft from active orders by FHIR status', () => {
    const { request } = normalize(bahmniRequest);
    expect(request.context.draftMedications).toEqual(['ibuprofen']);
    expect(request.context.currentMedications).toEqual(['warfarin']);
  });
});

describe('normalizeCdsRequest — Epic-style context + prefetch', () => {
  it('maps draftOrders, observations and allergies', () => {
    const { request, report } = normalize({
      hook: 'order-select',
      hookInstance: 'epic-1',
      context: {
        patientId: 'eXYZ',
        draftOrders: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'draft',
                medicationCodeableConcept: {
                  coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '5640' }],
                },
              },
            },
          ],
        },
      },
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'male', birthDate: '1955-01-01' },
        labs: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Observation',
                status: 'final',
                effectiveDateTime: '2026-09-10T08:00:00Z',
                code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] },
                valueQuantity: { value: 2.4, unit: 'mg/dL', code: 'mg/dL' },
              },
            },
            {
              resource: {
                resourceType: 'Observation',
                status: 'final',
                code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
                component: [
                  {
                    code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
                    valueQuantity: { value: 168, code: 'mm[Hg]' },
                  },
                  {
                    code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
                    valueQuantity: { value: 104, code: 'mm[Hg]' },
                  },
                ],
              },
            },
          ],
        },
        allergies: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'AllergyIntolerance',
                clinicalStatus: { coding: [{ code: 'active' }] },
                code: { text: 'Penicillin' },
              },
            },
          ],
        },
      },
    });

    const ctx = request.context;
    expect(ctx.medications).toEqual(['ibuprofen']);
    expect(ctx.creatinineUmolL).toBeCloseTo(212.16, 1);
    expect(ctx.systolicMmHg).toBe(168);
    expect(ctx.bpSystolicMmHg).toBe(168);
    expect(ctx.diastolicMmHg).toBe(104);
    expect(ctx.allergies).toEqual(['Penicillin']);
    expect(report.fieldsPopulated).toContain('creatinineUmolL');
  });

  it('takes the most recent value when a lab is repeated', () => {
    const obs = (date: string, value: number) => ({
      resource: {
        resourceType: 'Observation',
        status: 'final',
        effectiveDateTime: date,
        code: { coding: [{ system: 'http://loinc.org', code: '718-7' }] },
        valueQuantity: { value, code: 'g/dL' },
      },
    });
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'r-1',
      context: {},
      prefetch: {
        labs: {
          resourceType: 'Bundle',
          entry: [obs('2026-01-01T00:00:00Z', 11.2), obs('2026-09-01T00:00:00Z', 7.4)],
        },
      },
    });
    expect(request.context.haemoglobinGdl).toBe(7.4);
  });

  it('ignores entered-in-error results', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'e-1',
      context: {},
      prefetch: {
        labs: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Observation',
                status: 'entered-in-error',
                code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
                valueQuantity: { value: 220, code: 'mm[Hg]' },
              },
            },
          ],
        },
      },
    });
    expect(request.context.systolicMmHg).toBeUndefined();
  });
});

describe('normalizeCdsRequest — contract guarantees', () => {
  it('leaves a payload with no FHIR completely untouched', () => {
    const req: CdsHookRequest = {
      hook: 'medication-prescribe',
      hookInstance: 'flat-1',
      context: { medications: ['warfarin', 'ibuprofen'], ageYears: 70 },
    };
    const { request, report } = normalize(req);
    expect(request).toBe(req);
    expect(report.applied).toBe(false);
  });

  it('never overrides a flat field the caller supplied', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'precedence-1',
      // The integrator says 30; the FHIR Patient says ~46. The explicit
      // value wins — an integrator who speaks our dialect is authoritative.
      context: { ageYears: 30 },
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'female', birthDate: '1980-03-04' },
      },
    });
    expect(request.context.ageYears).toBe(30);
    expect(request.context.sex).toBe('female');
  });

  it('reports unresolved medications instead of silently dropping them', () => {
    const { report } = normalize({
      hook: 'order-select',
      hookInstance: 'unres-1',
      context: {},
      prefetch: {
        draftMedicationRequests: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                medicationCodeableConcept: { text: 'Some unlisted herbal tonic' },
              },
            },
          ],
        },
      },
    });
    expect(report.unresolvedMedications).toBe(1);
  });

  it('computes paediatric age units for an infant', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'infant-1',
      context: {},
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'male', birthDate: '2026-08-20' },
      },
    });
    expect(request.context.ageYears).toBe(0);
    expect(request.context.ageMonths).toBe(0);
    expect(request.context.ageDays).toBe(23);
  });
});

describe('deriveConditionSentinels', () => {
  it('sets a sentinel from ICD-10, SNOMED or display text', () => {
    expect(
      deriveConditionSentinels([
        { concept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'E11.9' }] } },
      ]).knownDiabetes,
    ).toBe(true);
    expect(
      deriveConditionSentinels([{ concept: { text: 'Pregnancy, second trimester' } }]).pregnant,
    ).toBe(true);
  });

  it('never writes a false sentinel — an absent code is not evidence of absence', () => {
    const out = deriveConditionSentinels([{ concept: { text: 'Malaria' } }]);
    expect(out.knownDiabetes).toBeUndefined();
    expect(Object.values(out).every((v) => v === true)).toBe(true);
  });
});

describe('normalizeCdsRequest — flat dialect from EMR plugins', () => {
  it('resolves dispensing labels to slugs', () => {
    const { request, report } = normalize({
      hook: 'patient-view',
      hookInstance: 'flat-labels',
      context: { medications: ['Warfarin 5mg Tablet', 'Amoxil 500mg cap'] },
    });
    expect(request.context.medications).toEqual(['warfarin', 'amoxicillin']);
    expect(report.medicationsCanonicalised).toBe(2);
  });

  it('resolves { code, system, name } objects by code first', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'flat-objects',
      context: {
        medications: [{ code: '5640', system: 'rxnorm', name: 'Brufen 400' }, 'warfarin'],
      },
    });
    expect(request.context.medications).toEqual(['ibuprofen', 'warfarin']);
  });

  it('keeps an unresolvable string verbatim but drops an unresolvable object', () => {
    // Interaction records exist for agents with no monograph (ethanol);
    // dropping the string would hide them. An object the strategies
    // cannot read is useless either way, so it is counted and removed.
    const { request, report } = normalize({
      hook: 'patient-view',
      hookInstance: 'flat-unresolved',
      context: { medications: ['ethanol', { code: '999', system: 'local', name: 'Mystery' }] },
    });
    expect(request.context.medications).toEqual(['ethanol']);
    expect(report.unresolvedMedications).toBe(2);
  });

  it('leaves an already-canonical payload as the same object', () => {
    const req: CdsHookRequest = {
      hook: 'patient-view',
      hookInstance: 'flat-canonical',
      context: { medications: ['warfarin', 'ibuprofen'] },
    };
    expect(normalize(req).request).toBe(req);
  });

  it('sets sentinels from coded diagnoses but never from free text', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'flat-dx',
      context: { diagnoses: ['ICD10:I48.0', 'ICD-10:E11.9', 'pregnancy test negative'] },
    });
    expect(request.context.hasAtrialFibrillation).toBe(true);
    expect(request.context.knownDiabetes).toBe(true);
    expect(request.context.pregnant).toBeUndefined();
  });

  it('does not override a sentinel the caller set explicitly', () => {
    const { request } = normalize({
      hook: 'patient-view',
      hookInstance: 'flat-dx-precedence',
      context: { diagnoses: ['ICD10:E11.9'], knownDiabetes: false },
    });
    expect(request.context.knownDiabetes).toBe(false);
  });

  it('unions flat and FHIR medication lists instead of replacing one with the other', () => {
    const { request } = normalize({
      hook: 'order-select',
      hookInstance: 'mixed',
      context: {
        medications: ['warfarin'],
        draftOrders: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'draft',
                medicationCodeableConcept: {
                  coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '5640' }],
                },
              },
            },
          ],
        },
      },
    });
    expect(request.context.medications).toEqual(expect.arrayContaining(['warfarin', 'ibuprofen']));
  });
});
