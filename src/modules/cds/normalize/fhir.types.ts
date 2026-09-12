/**
 * Minimal structural types for the FHIR R4 resources that arrive in a
 * real-world CDS Hooks payload.
 *
 * Deliberately NOT a FHIR library. VedaMD is content-driven, not
 * FHIR-coupled (see cds.types.ts) — we read a handful of fields off
 * inbound resources to build the flat clinical context the strategies
 * consume, and ignore everything else. Every field is optional because
 * the sender is an EMR we do not control: OpenMRS/Bahmni, OpenEMR,
 * Epic and Oracle Health all populate different subsets, and a missing
 * field must degrade to "not supplied", never to a throw.
 */

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  /** UCUM code — preferred over `unit`, which is display text. */
  code?: string;
  system?: string;
}

export interface FhirPatient {
  resourceType?: 'Patient';
  gender?: string;
  birthDate?: string;
  deceasedBoolean?: boolean;
  extension?: { url?: string; valueCode?: string }[];
}

export interface FhirObservationComponent {
  code?: FhirCodeableConcept;
  valueQuantity?: FhirQuantity;
  valueCodeableConcept?: FhirCodeableConcept;
  valueBoolean?: boolean;
  valueString?: string;
}

export interface FhirObservation extends FhirObservationComponent {
  resourceType?: 'Observation';
  status?: string;
  effectiveDateTime?: string;
  issued?: string;
  component?: FhirObservationComponent[];
}

export interface FhirCondition {
  resourceType?: 'Condition';
  code?: FhirCodeableConcept;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  onsetDateTime?: string;
}

export interface FhirMedicationRequest {
  resourceType?: 'MedicationRequest';
  status?: string;
  intent?: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  medicationReference?: { display?: string; reference?: string };
  contained?: FhirResource[];
  dosageInstruction?: unknown[];
}

export interface FhirAllergyIntolerance {
  resourceType?: 'AllergyIntolerance';
  code?: FhirCodeableConcept;
  clinicalStatus?: FhirCodeableConcept;
  criticality?: string;
  reaction?: { manifestation?: FhirCodeableConcept[] }[];
}

export interface FhirResource {
  resourceType?: string;
  [key: string]: unknown;
}

export interface FhirBundleEntry {
  resource?: FhirResource;
}

export interface FhirBundle {
  resourceType?: 'Bundle';
  type?: string;
  entry?: FhirBundleEntry[];
}

/** True when `v` looks like a FHIR Bundle (has an `entry` array). */
export function isBundle(v: unknown): v is FhirBundle {
  if (!v || typeof v !== 'object') return false;
  const b = v as FhirBundle;
  return b.resourceType === 'Bundle' || Array.isArray(b.entry);
}

/** True when `v` is a FHIR resource of the named type. */
export function isResource<T extends FhirResource>(v: unknown, type: string): v is T {
  return !!v && typeof v === 'object' && (v as FhirResource).resourceType === type;
}

/**
 * Flattens anything an EMR might put in a context/prefetch slot into a
 * list of resources: a Bundle, a bare resource, an array of either, or
 * a CDS Hooks prefetch wrapper (`{ response, resource }`).
 */
export function collectResources(value: unknown, out: FhirResource[] = []): FhirResource[] {
  if (!value || typeof value !== 'object') return out;

  if (Array.isArray(value)) {
    for (const item of value) collectResources(item, out);
    return out;
  }

  const obj: Record<string, unknown> = value as Record<string, unknown>;

  // CDS Hooks prefetch entries may be wrapped as { response: {...}, resource: {...} }.
  if (obj.resource && typeof obj.resource === 'object' && !obj.resourceType) {
    return collectResources(obj.resource, out);
  }

  if (isBundle(value)) {
    const entries: FhirBundleEntry[] = Array.isArray(value.entry) ? value.entry : [];
    for (const entry of entries) {
      if (entry?.resource) collectResources(entry.resource, out);
    }
    return out;
  }

  if (typeof obj.resourceType === 'string') out.push(obj as FhirResource);
  return out;
}
