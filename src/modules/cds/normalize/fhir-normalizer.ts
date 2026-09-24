/**
 * Normalises a real-world CDS Hooks request into the flat clinical
 * context VedaMD's rule strategies read.
 *
 * WHY THIS EXISTS
 * ---------------
 * The strategies consume a flat, unit-suffixed vocabulary
 * (`context.medications: ["warfarin"]`, `context.creatinineUmolL: 140`).
 * No EMR sends that. What they actually send is FHIR:
 *
 *   OpenMRS / Bahmni (openmrs-module-cdss)
 *     { hook, prefetch: { patient, conditions, draftMedicationRequests } }
 *   Epic / Oracle Health (CDS Hooks 1.0 / 2.0)
 *     { hook, context: { patientId, draftOrders }, prefetch: { patient, … } }
 *
 * Without this layer a stock CDS Hooks client gets a 200 with zero
 * cards — the integration looks wired up and silently does nothing.
 *
 * CONTRACT
 * --------
 * - Caller-supplied FLAT fields always win. An integrator who already
 *   speaks VedaMD's dialect is authoritative; we only fill gaps.
 * - Unmappable input is dropped, never guessed. A missing field makes a
 *   strategy skip; a wrong field makes it fire wrongly.
 * - Pure and side-effect free. Nothing is logged, cached or persisted —
 *   the inbound payload is PHI and this module must stay stateless
 *   (FR-088, NFR-028).
 */

import type { CdsHookRequest } from '../cds.types';
import {
  collectResources,
  type FhirAllergyIntolerance,
  type FhirCodeableConcept,
  type FhirCondition,
  type FhirMedicationRequest,
  type FhirObservation,
  type FhirObservationComponent,
  type FhirPatient,
  type FhirResource,
} from './fhir.types';
import { BP_PANEL_LOINCS, convert, LOINC_MAP, normaliseUnit } from './observation-map';
import { deriveConditionSentinels, type DrugCodeIndex } from './code-resolver';

/** Prefetch/context keys that carry draft (proposed, not yet signed) orders. */
const DRAFT_KEYS = [
  'draftMedicationRequests',
  'draftOrders',
  'draftMedications',
  'proposedMedications',
];
/** Keys that carry the patient's existing active medication list. */
const ACTIVE_KEYS = [
  'medications',
  'currentMedications',
  'activeMedications',
  'medicationRequests',
];

export interface NormalizationResult {
  /** The request with a FHIR-derived context merged underneath the original. */
  request: CdsHookRequest;
  /** PHI-free description of what was mapped — safe to log and to return as diagnostics. */
  report: NormalizationReport;
}

/**
 * Counts and field names only — never values. Integrators need to see
 * "we understood 2 of your 5 medications" without us echoing patient
 * data into a log line.
 */
export interface NormalizationReport {
  /** True when the payload contained FHIR we mapped from. */
  applied: boolean;
  /** Context fields this layer populated (the caller had not set them). */
  fieldsPopulated: string[];
  /** FHIR resource types seen, with counts. */
  resourcesSeen: Record<string, number>;
  /** Medication codings we could not resolve to a VedaMD drug. */
  unresolvedMedications: number;
  /** Observation LOINC codes present that we have no mapping for. */
  unmappedObservationCodes: string[];
  /** Flat-dialect medication entries rewritten to a canonical VedaMD slug. */
  medicationsCanonicalised: number;
}

export interface NormalizerDeps {
  drugs: DrugCodeIndex;
  /** Injected for testability; defaults to the wall clock. */
  now?: () => Date;
}

export function normalizeCdsRequest(
  req: CdsHookRequest,
  deps: NormalizerDeps,
): NormalizationResult {
  const now = deps.now ?? (() => new Date());
  const original: Record<string, unknown> = (req.context ?? {}) as Record<string, unknown>;
  const derived: Record<string, unknown> = {};
  const report: NormalizationReport = {
    applied: false,
    fieldsPopulated: [],
    resourcesSeen: {},
    unresolvedMedications: 0,
    unmappedObservationCodes: [],
    medicationsCanonicalised: 0,
  };

  // Plugins that read an EMR's own tables (OpenEMR, Frappe Health, GNU
  // Health, DHIS2) send the flat dialect, but with what the EMR actually
  // stores: dispensing labels ("Warfarin 5mg Tablet"), coded objects
  // ({ code, system, name }) and coded diagnoses ("ICD10:I48.0"). The
  // strategies match exact slugs, so without this step those payloads
  // evaluate cleanly and return zero cards.
  const flat = canonicaliseFlatContext(original, deps.drugs, report);

  // Gather every FHIR resource the payload carries, from both slots.
  const prefetch: Record<string, unknown> = (req.prefetch ?? {}) as Record<string, unknown>;
  const draftResources: FhirResource[] = [];
  const activeResources: FhirResource[] = [];
  const generalResources: FhirResource[] = [];

  for (const [key, value] of Object.entries({ ...prefetch, ...original })) {
    // A flat scalar (the dialect we already speak) is not FHIR — leave it.
    if (!value || typeof value !== 'object') continue;
    // A plain string array is the flat medication dialect, not FHIR.
    if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) continue;

    const resources = collectResources(value);
    if (resources.length === 0) continue;

    if (DRAFT_KEYS.includes(key)) draftResources.push(...resources);
    else if (ACTIVE_KEYS.includes(key)) activeResources.push(...resources);
    else generalResources.push(...resources);
  }

  const all = [...draftResources, ...activeResources, ...generalResources];
  if (all.length === 0) {
    if (!flat.changed) return { request: req, report };
    report.fieldsPopulated = flat.populated.sort();
    return { request: { ...req, context: flat.context }, report };
  }
  report.applied = true;
  for (const r of all) {
    const t = r.resourceType ?? 'Unknown';
    report.resourcesSeen[t] = (report.resourcesSeen[t] ?? 0) + 1;
  }

  // ---- Patient → demographics ----
  const patient = all.find((r) => r.resourceType === 'Patient') as FhirPatient | undefined;
  if (patient) applyPatient(patient, derived, now());

  // ---- Observations → vitals + labs ----
  const observations = all.filter((r) => r.resourceType === 'Observation') as FhirObservation[];
  applyObservations(observations, derived, report);

  // ---- Conditions → diagnoses list + boolean sentinels ----
  const conditions = all.filter((r) => r.resourceType === 'Condition') as FhirCondition[];
  applyConditions(conditions, derived);

  // ---- AllergyIntolerance → allergen strings ----
  const allergies = all.filter(
    (r) => r.resourceType === 'AllergyIntolerance',
  ) as FhirAllergyIntolerance[];
  applyAllergies(allergies, derived);

  // ---- MedicationRequest → VedaMD drug slugs ----
  applyMedications(draftResources, activeResources, generalResources, derived, deps.drugs, report);
  aliasStrategyFields(derived);

  // Merge: caller-supplied flat values win for scalars. Medication lists
  // are the exception and are UNIONED — a caller who sends
  // `medications: ["warfarin"]` alongside FHIR draftOrders for ibuprofen
  // means both, and letting one list replace the other would hide
  // exactly the pair the interaction check exists to catch.
  const merged: Record<string, unknown> = { ...derived, ...flat.context };
  for (const key of FLAT_MEDICATION_KEYS) {
    const fromFhir = derived[key];
    const fromCaller = flat.context[key];
    if (Array.isArray(fromFhir) && Array.isArray(fromCaller)) {
      merged[key] = [...new Set([...fromCaller, ...fromFhir])];
    }
  }
  for (const key of Object.keys(derived)) {
    if (!(key in original)) report.fieldsPopulated.push(key);
  }
  for (const key of flat.populated) {
    if (!report.fieldsPopulated.includes(key)) report.fieldsPopulated.push(key);
  }
  report.fieldsPopulated.sort();

  return { request: { ...req, context: merged }, report };
}

function applyPatient(patient: FhirPatient, out: Record<string, unknown>, now: Date): void {
  const gender = patient.gender?.toLowerCase();
  if (gender === 'male' || gender === 'female') out.sex = gender;

  if (!patient.birthDate) return;
  // FHIR birthDate may be YYYY, YYYY-MM or YYYY-MM-DD.
  const parts = patient.birthDate.split('-').map((p) => Number(p));
  const [y, m = 1, d = 1] = parts;
  if (!Number.isFinite(y)) return;
  const dob = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (Number.isNaN(dob.getTime())) return;
  if (now.getTime() < dob.getTime()) return;

  // Calendar arithmetic: dividing days by 365.25 made a patient 17 on their
  // 18th birthday.
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  let months = years * 12 + (now.getUTCMonth() - dob.getUTCMonth());
  if (now.getUTCDate() < dob.getUTCDate()) months -= 1;
  years = Math.floor(months / 12);
  const days = Math.floor((now.getTime() - dob.getTime()) / 86_400_000);

  out.ageYears = years;
  // Paediatric strategies branch on the finest unit supplied, so only
  // offer months/days/hours where they are clinically meaningful —
  // ageMonths on a 40-year-old would just be noise.
  if (years < 5) out.ageMonths = months;
  if (months < 2) out.ageDays = days;
  if (days < 3) {
    // Hours need a birth time. With only a date, midnight UTC overstated a
    // newborn's age by up to a day (21 h for a Nairobi evening birth), which
    // could skip the first-24-hours jaundice branch. Without the FHIR
    // birthTime extension, count from the END of the birth date instead:
    // it can only understate the age, which applies the lower, more
    // sensitive thresholds.
    const birthTime = patient._birthDate?.extension?.find((e) =>
      e.url?.endsWith('/patient-birthTime'),
    )?.valueDateTime;
    const exact = birthTime ? new Date(birthTime) : null;
    const born =
      exact && !Number.isNaN(exact.getTime()) && exact.getTime() <= now.getTime()
        ? exact
        : new Date(dob.getTime() + 86_400_000);
    out.ageHours = Math.max(0, Math.floor((now.getTime() - born.getTime()) / 3_600_000));
  }
}

/**
 * Several strategies read condition and weight fields under different names
 * from the ones the normaliser writes (paediatric dosing reads
 * `childWeightKg`, AF/PEN read `hypertension`/`diabetes`, HIV ART reads
 * `hivStatus`), so FHIR input never reached them. Mirror the derived values
 * onto those names. Caller-supplied values still win at the merge.
 */
function aliasStrategyFields(out: Record<string, unknown>): void {
  if (out.knownHtn === true && out.hypertension === undefined) out.hypertension = true;
  if (out.knownDiabetes === true && out.diabetes === undefined) out.diabetes = true;
  if (out.knownHivPositive === true && out.hivStatus === undefined) out.hivStatus = 'positive';
  // Only for a child: an adult weight must not trigger paediatric mg/kg dosing.
  const age = out.ageYears;
  if (
    typeof out.weightKg === 'number' &&
    out.childWeightKg === undefined &&
    typeof age === 'number' &&
    age < 12
  ) {
    out.childWeightKg = out.weightKg;
  }
}

function applyObservations(
  observations: FhirObservation[],
  out: Record<string, unknown>,
  report: NormalizationReport,
): void {
  // Most recent first, so the newest value for a given code wins.
  const sorted = [...observations].sort((a, b) => timeOf(b) - timeOf(a));

  for (const obs of sorted) {
    // A cancelled or entered-in-error result must never drive a rule.
    if (obs.status === 'cancelled' || obs.status === 'entered-in-error') continue;

    for (const code of loincCodes(obs.code)) {
      if (BP_PANEL_LOINCS.has(code)) {
        for (const component of obs.component ?? []) applyObservationValue(component, out, report);
        continue;
      }
      applyObservationValue(obs, out, report, code);
    }

    // Panels that are not a recognised BP panel still carry components.
    if (obs.component?.length && !loincCodes(obs.code).some((c) => BP_PANEL_LOINCS.has(c))) {
      for (const component of obs.component) applyObservationValue(component, out, report);
    }
  }
}

function applyObservationValue(
  node: FhirObservationComponent,
  out: Record<string, unknown>,
  report: NormalizationReport,
  knownCode?: string,
): void {
  const codes = knownCode ? [knownCode] : loincCodes(node.code);
  const q = node.valueQuantity;

  for (const code of codes) {
    const mapping = LOINC_MAP[code];
    if (!mapping) {
      if (q?.value !== undefined && !report.unmappedObservationCodes.includes(code)) {
        report.unmappedObservationCodes.push(code);
      }
      continue;
    }
    if (q?.value === undefined) continue;

    const value = convert(mapping, q.value, normaliseUnit(q));
    if (value === null) continue;

    for (const field of mapping.fields) {
      // First writer wins — observations are sorted newest-first.
      if (!(field in out)) out[field] = value;
    }
  }
}

function applyConditions(conditions: FhirCondition[], out: Record<string, unknown>): void {
  const active = conditions.filter((c) => {
    const status = c.clinicalStatus?.coding?.[0]?.code ?? c.clinicalStatus?.text;
    // No status means "unknown", which OpenMRS and OpenEMR both send —
    // treating that as inactive would drop most real problem lists.
    // A refuted or erroneous diagnosis is not one the patient has.
    const verification = (
      c.verificationStatus?.coding?.[0]?.code ?? c.verificationStatus?.text
    )?.toLowerCase();
    if (verification === 'refuted' || verification === 'entered-in-error') return false;
    if (!status) return true;
    return !['inactive', 'resolved', 'remission'].includes(status.toLowerCase());
  });
  if (active.length === 0) return;

  const names = active
    .map((c) => c.code?.text ?? c.code?.coding?.find((x) => x.display)?.display)
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());

  if (names.length > 0) out.diagnoses = [...new Set(names)];

  Object.assign(out, deriveConditionSentinels(active.map((c) => ({ concept: c.code }))));
}

function applyAllergies(allergies: FhirAllergyIntolerance[], out: Record<string, unknown>): void {
  const active = allergies.filter((a) => {
    const status = a.clinicalStatus?.coding?.[0]?.code ?? a.clinicalStatus?.text;
    return !status || status.toLowerCase() === 'active';
  });

  const names = active
    .map((a) => a.code?.text ?? a.code?.coding?.find((c) => c.display)?.display)
    .filter((n): n is string => !!n);

  if (names.length > 0) out.allergies = [...new Set(names)];
}

function applyMedications(
  draft: FhirResource[],
  active: FhirResource[],
  general: FhirResource[],
  out: Record<string, unknown>,
  index: DrugCodeIndex,
  report: NormalizationReport,
): void {
  const draftSlugs: string[] = [];
  const activeSlugs: string[] = [];

  // The slot a resource arrived in is only a DEFAULT, never the verdict.
  // openmrs-module-cdss builds one `draftMedicationRequests` bundle that
  // holds the patient's existing active orders AND the new draft, so
  // trusting the slot name would file live medications as proposed and
  // hand the prescribing-safety rules the wrong "new" drug.
  const classify = (slot: 'draft' | 'active' | 'general', resources: FhirResource[]): void => {
    for (const r of resources) {
      if (r.resourceType !== 'MedicationRequest' && r.resourceType !== 'MedicationStatement') {
        continue;
      }
      const med = r as FhirMedicationRequest;
      // A stopped, cancelled, completed or erroneous order is not a drug the
      // patient is on; counting it raised interaction alerts against it.
      if (INACTIVE_MED_STATUSES.has(med.status?.toLowerCase() ?? '')) continue;
      const slugs = resolveMedication(med, index);
      if (slugs.length === 0) {
        report.unresolvedMedications += 1;
        continue;
      }
      (isDraftOrder(med, slot) ? draftSlugs : activeSlugs).push(...slugs);
    }
  };

  classify('draft', draft);
  classify('active', active);
  classify('general', general);

  const draftUnique = [...new Set(draftSlugs)];
  const activeUnique = [...new Set(activeSlugs)];
  const all = [...new Set([...draftUnique, ...activeUnique])];

  if (draftUnique.length > 0) {
    out.draftMedications = draftUnique;
    out.proposed = draftUnique;
  }
  if (activeUnique.length > 0) out.currentMedications = activeUnique;
  // `medications` is the field most strategies read, and interaction
  // checking needs draft and active in one list to see the new pair.
  if (all.length > 0) out.medications = all;
}

const INACTIVE_MED_STATUSES = new Set([
  'stopped',
  'cancelled',
  'completed',
  'entered-in-error',
  'not-taken',
]);

/**
 * An explicit FHIR status or intent decides; the slot only breaks ties.
 * `draft`/`proposal`/`plan` mean the clinician has not committed yet —
 * exactly the moment prescribing safety checks are worth showing.
 */
function isDraftOrder(med: FhirMedicationRequest, slot: 'draft' | 'active' | 'general'): boolean {
  const status = med.status?.toLowerCase();
  const intent = med.intent?.toLowerCase();

  if (status === 'draft') return true;
  if (intent === 'proposal' || intent === 'plan') return true;
  if (status && status !== 'unknown') return false;

  return slot === 'draft';
}

function resolveMedication(med: FhirMedicationRequest, index: DrugCodeIndex): string[] {
  const containedCodes = (med.contained ?? [])
    .filter((c) => c.resourceType === 'Medication')
    .map((c) => (c as { code?: FhirCodeableConcept }).code);
  // A combination product counts as each of its components.
  const components = index.resolveComponents([
    med.medicationCodeableConcept?.text,
    ...(med.medicationCodeableConcept?.coding ?? []).map((c) => c.display),
    ...containedCodes.flatMap((c) => [c?.text, ...(c?.coding ?? []).map((x) => x.display)]),
    med.medicationReference?.display,
  ]);
  return [...new Set([...resolveSingle(med, containedCodes, index), ...components])];
}

function resolveSingle(
  med: FhirMedicationRequest,
  containedCodes: Array<FhirCodeableConcept | undefined>,
  index: DrugCodeIndex,
): string[] {
  const direct = index.resolve(med.medicationCodeableConcept);
  if (direct) return [direct];

  // medicationReference with a contained Medication resource.
  for (const code of containedCodes) {
    const hit = index.resolve(code);
    if (hit) return [hit];
  }

  const display = med.medicationReference?.display;
  const byName = display ? index.resolveName(display) : null;
  return byName ? [byName] : [];
}

/** Flat-dialect keys that carry medication lists. */
const FLAT_MEDICATION_KEYS = [
  'medications',
  'proposed',
  'current',
  'draftMedications',
  'currentMedications',
  'proposedMedications',
];

/** "ICD10:I48.0", "ICD-10:E11.9", "SNOMED:44054006" as sent by EMR plugins. */
const CODED_DIAGNOSIS = /^\s*(icd-?10(?:-cm)?|snomed(?:[\s-]?ct)?)\s*:\s*([A-Za-z0-9.]+)\s*$/i;

interface FlatCanonicalisation {
  context: Record<string, unknown>;
  changed: boolean;
  /** Keys this step added that the caller had not set. */
  populated: string[];
}

/**
 * Canonicalises the flat dialect without changing its meaning.
 *
 * - Medication strings resolve to a VedaMD slug by name. A string that
 *   is already a slug resolves to itself, so well-formed callers see no
 *   change. An unresolvable string is KEPT verbatim: interaction records
 *   exist for agents with no monograph (ethanol, dipyridamole), and
 *   dropping those would suppress a real interaction.
 * - `{ code, system, name }` objects resolve by code, then by name. The
 *   strategies ignore objects outright, so an unresolved one is dropped
 *   and counted rather than passed through to be silently ignored.
 * - Coded diagnoses set boolean sentinels by CODE ONLY. Free-text
 *   diagnoses never do: "pregnancy test negative" must not set
 *   `pregnant`.
 */
function canonicaliseFlatContext(
  original: Record<string, unknown>,
  index: DrugCodeIndex,
  report: NormalizationReport,
): FlatCanonicalisation {
  const context: Record<string, unknown> = { ...original };
  const populated: string[] = [];
  let changed = false;

  for (const key of FLAT_MEDICATION_KEYS) {
    const list = original[key];
    if (!Array.isArray(list)) continue;
    // A FHIR Bundle or resource list in this slot is handled by the FHIR path.
    if (list.some((item) => item && typeof item === 'object' && 'resourceType' in item)) continue;

    const out: string[] = [];
    for (const item of list) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const slug = index.resolveName(trimmed);
        if (slug) {
          if (slug !== trimmed) report.medicationsCanonicalised += 1;
          out.push(slug);
        } else {
          report.unresolvedMedications += 1;
          out.push(trimmed);
        }
        continue;
      }

      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const name = [obj.name, obj.display, obj.text].find(
          (v): v is string => typeof v === 'string' && v.trim() !== '',
        );
        const code = typeof obj.code === 'string' ? obj.code : undefined;
        const system = typeof obj.system === 'string' ? obj.system : undefined;
        const slug = index.resolve({
          coding: code ? [{ system, code, display: name }] : [],
          text: name,
        });
        if (slug) {
          report.medicationsCanonicalised += 1;
          out.push(slug);
        } else {
          report.unresolvedMedications += 1;
        }
      }
    }

    const unique = [...new Set(out)];
    if (unique.length !== list.length || unique.some((v, i) => v !== list[i])) {
      context[key] = unique;
      changed = true;
    }
  }

  const diagnoses = original.diagnoses;
  if (Array.isArray(diagnoses)) {
    const codings: FhirCodeableConcept[] = [];
    for (const entry of diagnoses) {
      if (typeof entry !== 'string') continue;
      const match = CODED_DIAGNOSIS.exec(entry);
      if (!match) continue;
      const system = match[1].toLowerCase().startsWith('icd')
        ? 'http://hl7.org/fhir/sid/icd-10'
        : 'http://snomed.info/sct';
      codings.push({ coding: [{ system, code: match[2] }] });
    }
    // Codes only: strip any display so the text fallback cannot fire.
    const sentinels = deriveConditionSentinels(codings.map((concept) => ({ concept })));
    for (const [field, value] of Object.entries(sentinels)) {
      if (field in original) continue;
      context[field] = value;
      populated.push(field);
      changed = true;
    }
  }

  return { context, changed, populated };
}

function loincCodes(concept: FhirCodeableConcept | undefined): string[] {
  return (concept?.coding ?? [])
    .filter((c) => (c.system ?? '').toLowerCase().includes('loinc'))
    .map((c) => c.code?.trim())
    .filter((c): c is string => !!c);
}

function timeOf(obs: FhirObservation): number {
  const t = Date.parse(obs.effectiveDateTime ?? obs.issued ?? '');
  return Number.isNaN(t) ? 0 : t;
}
