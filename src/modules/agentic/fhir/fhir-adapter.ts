import type { AgenticClinicalContext } from '../agentic.types';

/**
 * FHIR R4 → AgenticClinicalContext adapter.
 *
 * Accepts a FHIR R4 Bundle (or a single resource) and extracts the
 * anonymous clinical signals VedaMD reasons over. We do NOT validate
 * the full FHIR profile — we read the fields we use and ignore the
 * rest (consistent with VedaMD's content-driven, non-FHIR-coupled
 * posture). Identifiers / names / addresses are intentionally NOT
 * extracted.
 *
 * Supported resources: Patient, MedicationRequest, MedicationStatement,
 * Medication, Condition, AllergyIntolerance, Observation.
 */

interface FhirResource {
  resourceType?: string;
  [k: string]: unknown;
}

interface FhirBundle {
  resourceType?: string;
  entry?: Array<{ resource?: FhirResource }>;
}

export function fhirToContext(
  input: Record<string, unknown>,
  hook?: string,
  question?: string,
): AgenticClinicalContext {
  const resources = flattenResources(input as FhirBundle | FhirResource);

  const ctx: AgenticClinicalContext = { hook, question };
  const medications: string[] = [];
  const diagnoses: string[] = [];
  const allergies: string[] = [];
  const labs: NonNullable<AgenticClinicalContext['labs']> = [];

  for (const r of resources) {
    switch (r.resourceType) {
      case 'Patient':
        ctx.patient = { ...(ctx.patient ?? {}), ...parsePatient(r) };
        break;
      case 'MedicationRequest':
      case 'MedicationStatement': {
        const med = codeableText((r.medicationCodeableConcept as FhirCodeable) ?? undefined);
        if (med) medications.push(med);
        break;
      }
      case 'Medication': {
        const med = codeableText((r.code as FhirCodeable) ?? undefined);
        if (med) medications.push(med);
        break;
      }
      case 'Condition': {
        const dx = codeableText((r.code as FhirCodeable) ?? undefined);
        if (dx) diagnoses.push(dx);
        break;
      }
      case 'AllergyIntolerance': {
        const al = codeableText((r.code as FhirCodeable) ?? undefined);
        if (al) allergies.push(al);
        break;
      }
      case 'Observation': {
        const lab = parseObservation(r);
        if (lab) labs.push(lab);
        break;
      }
      default:
        break;
    }
  }

  if (medications.length) ctx.medications = dedupe(medications);
  if (diagnoses.length) ctx.diagnoses = dedupe(diagnoses);
  if (allergies.length) ctx.allergies = dedupe(allergies);
  if (labs.length) ctx.labs = labs;
  return ctx;
}

function flattenResources(input: FhirBundle | FhirResource): FhirResource[] {
  if (input?.resourceType === 'Bundle') {
    return ((input as FhirBundle).entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is FhirResource => !!r);
  }
  if (input?.resourceType) return [input as FhirResource];
  return [];
}

interface FhirCodeable {
  text?: string;
  coding?: Array<{ system?: string; code?: string; display?: string }>;
}

function codeableText(cc?: FhirCodeable): string | undefined {
  if (!cc) return undefined;
  if (cc.text) return cc.text;
  const c = cc.coding?.[0];
  return c?.display ?? c?.code;
}

function parsePatient(r: FhirResource): NonNullable<AgenticClinicalContext['patient']> {
  const p: NonNullable<AgenticClinicalContext['patient']> = {};
  const gender = r.gender;
  if (gender === 'male' || gender === 'female' || gender === 'other') p.sex = gender;
  const birthDate = typeof r.birthDate === 'string' ? r.birthDate : undefined;
  if (birthDate) {
    const ageMs = Date.now() - new Date(birthDate).getTime();
    const years = ageMs / (365.25 * 24 * 3600 * 1000);
    if (years >= 2) p.ageYears = Math.floor(years);
    else p.ageMonths = Math.floor(years * 12);
  }
  return p;
}

function parseObservation(
  r: FhirResource,
): NonNullable<AgenticClinicalContext['labs']>[number] | null {
  const code = r.code as FhirCodeable | undefined;
  const name = codeableText(code);
  const loinc = code?.coding?.find((c) => c.system?.includes('loinc'))?.code;
  const vq = r.valueQuantity as { value?: number; unit?: string } | undefined;
  if (vq?.value != null) {
    return {
      code: loinc,
      name,
      value: vq.value,
      unit: vq.unit,
      date: typeof r.effectiveDateTime === 'string' ? r.effectiveDateTime : undefined,
    };
  }
  const vs = (r.valueString as string | undefined) ?? codeableText(r.valueCodeableConcept as FhirCodeable);
  if (vs != null) {
    return { code: loinc, name, value: vs };
  }
  return null;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
