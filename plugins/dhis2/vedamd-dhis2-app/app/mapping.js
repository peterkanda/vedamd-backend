/**
 * Maps a DHIS2 Tracker enrolment into a VedaMD clinical context.
 *
 * DHIS2 has no fixed clinical schema: every implementation names its
 * own data elements and tracked entity attributes. So the mapping is
 * CONFIGURATION, saved per instance in the DHIS2 dataStore, never
 * hardcoded here.
 *
 * A mapping entry names the DHIS2 uid, the VedaMD context field, and
 * how to coerce the value. Anything not in the map is not sent —
 * pushing unmapped values through under guessed names is how a
 * "haemoglobin" data element ends up interpreted as g/dL when the site
 * records g/L.
 */

/** Coercions available to a mapping entry. */
export const coercions = {
  number: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
  boolean: (raw) => {
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0') return false;
    return null;
  },
  text: (raw) => {
    const s = String(raw ?? '').trim();
    return s === '' ? null : s;
  },
  /** Splits a multi-value field ("warfarin,ibuprofen") into a list. */
  list: (raw) => {
    const items = String(raw ?? '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : null;
  },
};

/**
 * There is deliberately NO default mapping. DHIS2 metadata uids are
 * chosen per implementation, so any shipped default is either wrong for
 * your instance or silently maps the wrong data element. The app refuses
 * to run a check until an administrator has saved a mapping.
 *
 * EXAMPLE_MAPPING is verified against the DHIS2 Sierra Leone demo
 * database (play.dhis2.org). It is a template to copy and re-point — not
 * something to deploy as-is to a national HMIS.
 */
export const EXAMPLE_MAPPING = [
  // Tracked entity attribute "Gender" (option set codes Male / Female)
  { uid: 'cejWyOfXge6', field: 'sex', coerce: 'text', values: { Male: 'male', Female: 'female' } },
  // Data element "Age in years"
  { uid: 'qrur9Dvnyt5', field: 'ageYears', coerce: 'number', min: 0, max: 130 },
  // Data element "Height in cm"
  { uid: 'GieVkTxp4HH', field: 'heightCm', coerce: 'number', min: 20, max: 260 },
  // Data element "Weight in kg"
  { uid: 'vV9UWAZohSf', field: 'weightKg', coerce: 'number', min: 0.3, max: 400 },
  // Data element "WHOMCH Systolic blood pressure"
  { uid: 'M4HEOoEFTAT', field: 'systolicMmHg', coerce: 'number', min: 40, max: 300 },
  // Data element "WHOMCH Diastolic blood pressure"
  { uid: 'dyYdfamSY2Z', field: 'diastolicMmHg', coerce: 'number', min: 10, max: 200 },
];

/** Context fields a mapping entry may target. */
const ALLOWED_FIELDS = new Set([
  'sex', 'ageYears', 'ageMonths', 'weightKg', 'heightCm', 'systolicMmHg', 'diastolicMmHg',
  'heartRatePerMin', 'respiratoryRatePerMin', 'oxygenSatPercent', 'bodyTempC', 'pregnant',
  'gestationalAgeWeeks', 'haemoglobinGdl', 'creatinineUmolL', 'medications', 'draftMedications',
  'allergies', 'diagnoses', 'hivStatus', 'muacMm',
]);

/**
 * Validates an administrator-supplied mapping. Returns a list of
 * human-readable problems; an empty list means the mapping is usable.
 */
export function validateMapping(mapping) {
  if (!Array.isArray(mapping)) return ['Mapping must be a JSON array.'];
  if (mapping.length === 0) return ['Mapping is empty — add at least one entry.'];

  const problems = [];
  mapping.forEach((entry, i) => {
    const where = `Entry ${i + 1}`;
    if (!entry || typeof entry !== 'object') {
      problems.push(`${where}: must be an object.`);
      return;
    }
    if (typeof entry.uid !== 'string' || !/^[A-Za-z][A-Za-z0-9]{10}$/.test(entry.uid)) {
      problems.push(`${where}: "uid" must be an 11-character DHIS2 uid.`);
    }
    if (!ALLOWED_FIELDS.has(entry.field)) {
      problems.push(`${where}: "field" ${JSON.stringify(entry.field)} is not a VedaMD context field.`);
    }
    if (entry.coerce !== undefined && !(entry.coerce in coercions)) {
      problems.push(`${where}: "coerce" must be one of ${Object.keys(coercions).join(', ')}.`);
    }
  });
  return problems;
}

/**
 * Builds a VedaMD context from a Tracker payload.
 *
 * @param {object} input
 * @param {Array}  input.attributes  trackedEntity attributes [{attribute, value}]
 * @param {Array}  input.dataValues  event data values [{dataElement, value}]
 * @param {Array}  input.mapping     validated mapping entries
 * @returns {{context: object, unmapped: string[]}}
 */
export function buildContext({ attributes = [], dataValues = [], mapping = [] } = {}) {
  const byUid = new Map();
  for (const { attribute, value } of attributes) {
    if (attribute !== undefined) byUid.set(attribute, value);
  }
  for (const { dataElement, value } of dataValues) {
    // Event data is more recent than enrolment attributes, so it wins.
    if (dataElement !== undefined) byUid.set(dataElement, value);
  }

  const context = {};
  const mapped = new Set();

  for (const entry of mapping) {
    mapped.add(entry.uid);
    if (!byUid.has(entry.uid)) continue;

    const raw = byUid.get(entry.uid);
    if (raw === null || raw === undefined || raw === '') continue;

    const coerce = coercions[entry.coerce] ?? coercions.text;
    let value = coerce(raw);
    if (value === null) continue;

    // An explicit value map (DHIS2 option set → VedaMD vocabulary).
    if (entry.values) {
      const replacement = entry.values[raw] ?? entry.values[String(value)];
      if (replacement === undefined) continue;
      value = replacement;
    }

    if (typeof value === 'number') {
      if (entry.min !== undefined && value < entry.min) continue;
      if (entry.max !== undefined && value > entry.max) continue;
    }

    context[entry.field] = value;
  }

  // Report what the deployment sent but nobody mapped, so implementers
  // can extend the map instead of wondering why a rule never fires.
  const unmapped = [...byUid.keys()].filter((uid) => !mapped.has(uid));

  return { context, unmapped };
}
