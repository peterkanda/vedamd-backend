/**
 * LOINC → VedaMD context-field mapping, with UCUM unit conversion.
 *
 * The strategies read a flat, unit-suffixed clinical vocabulary
 * (`creatinineUmolL`, `haemoglobinGdl`, `systolicMmHg`…). Real EMRs
 * send FHIR Observations coded in LOINC, in whatever unit the local
 * lab reports — mg/dL in most US and many SSA labs, µmol/L in
 * SI-reporting labs. Mapping the code without converting the unit is
 * worse than not mapping at all: a creatinine of 1.2 mg/dL read as
 * 1.2 µmol/L silently turns a normal result into profound renal
 * failure and fires the wrong dose-adjustment card.
 *
 * So every entry declares its canonical unit and the set of source
 * units it accepts. An Observation whose unit is absent or
 * unrecognised is DROPPED, not guessed — a missing field makes a
 * strategy skip (safe), a wrong field makes it fire wrongly (unsafe).
 *
 * Conversion factors:
 *   creatinine  mg/dL × 88.4   = µmol/L
 *   urea        mg/dL × 0.357  = mmol/L  (BUN → urea)
 *   glucose     mg/dL ÷ 18.0182 = mmol/L
 *   cholesterol mg/dL ÷ 38.67  = mmol/L
 *   bilirubin   µmol/L ÷ 17.104 = mg/dL
 *   haemoglobin g/L ÷ 10       = g/dL
 */

/** Target context fields written for one observation, after conversion. */
export interface ObservationMapping {
  /** Context fields to populate. Several strategies spell the same
   *  signal differently (systolicMmHg / bpSystolicMmHg / systolicBp);
   *  we write every accepted alias so all of them see the value. */
  fields: string[];
  /** Canonical unit the context fields are defined in. */
  canonicalUnit: string;
  /** Accepted source units → multiplier onto the canonical unit. */
  units: Record<string, number>;
  /** Sanity bounds in canonical units; values outside are dropped. */
  min?: number;
  max?: number;
}

/** Lowercased UCUM/display unit → multiplier, for unitless ratios. */
const UNITLESS: Record<string, number> = { '': 1, '1': 1, '{score}': 1 };
const PERCENT: Record<string, number> = { '%': 1, '': 1 };
const MMHG: Record<string, number> = { 'mm[hg]': 1, mmhg: 1, '': 1 };
const PER_MIN: Record<string, number> = {
  '/min': 1,
  '1/min': 1,
  bpm: 1,
  '{beats}/min': 1,
  '{breaths}/min': 1,
  '': 1,
};

export const LOINC_MAP: Record<string, ObservationMapping> = {
  // ---- Vitals ----
  '8480-6': {
    fields: ['systolicMmHg', 'bpSystolicMmHg', 'systolicBp'],
    canonicalUnit: 'mm[Hg]',
    units: MMHG,
    min: 40,
    max: 300,
  },
  '8462-4': {
    fields: ['diastolicMmHg', 'bpDiastolicMmHg', 'diastolicBp'],
    canonicalUnit: 'mm[Hg]',
    units: MMHG,
    min: 10,
    max: 200,
  },
  '8867-4': {
    fields: ['heartRatePerMin', 'heartRate', 'pulsePerMin'],
    canonicalUnit: '/min',
    units: PER_MIN,
    min: 20,
    max: 300,
  },
  '9279-1': {
    fields: ['respiratoryRatePerMin', 'respiratoryRate'],
    canonicalUnit: '/min',
    units: PER_MIN,
    min: 4,
    max: 120,
  },
  '2708-6': {
    fields: ['oxygenSatPercent', 'spO2Percent'],
    canonicalUnit: '%',
    units: PERCENT,
    min: 20,
    max: 100,
  },
  '59408-5': {
    fields: ['oxygenSatPercent', 'spO2Percent'],
    canonicalUnit: '%',
    units: PERCENT,
    min: 20,
    max: 100,
  },
  '8310-5': {
    fields: ['bodyTempC', 'temperatureC', 'feverC'],
    canonicalUnit: 'Cel',
    // Fahrenheit needs an offset, not a factor — handled in convert().
    units: { cel: 1, 'deg c': 1, c: 1, '°c': 1 },
    min: 25,
    max: 45,
  },
  '29463-7': {
    fields: ['weightKg'],
    canonicalUnit: 'kg',
    units: { kg: 1, g: 0.001, '[lb_av]': 0.453592, lb: 0.453592 },
    min: 0.3,
    max: 400,
  },
  '8302-2': {
    fields: ['heightCm'],
    canonicalUnit: 'cm',
    units: { cm: 1, m: 100, '[in_i]': 2.54 },
    min: 20,
    max: 260,
  },
  '39156-5': {
    fields: ['bmi'],
    canonicalUnit: 'kg/m2',
    units: { 'kg/m2': 1, '': 1 },
    min: 5,
    max: 100,
  },
  '9269-2': {
    fields: ['gcs', 'glasgowComaScale'],
    canonicalUnit: '{score}',
    units: UNITLESS,
    min: 3,
    max: 15,
  },

  // ---- Renal ----
  '2160-0': {
    fields: ['creatinineUmolL'],
    canonicalUnit: 'umol/L',
    units: { 'umol/l': 1, 'µmol/l': 1, 'mg/dl': 88.4, 'mg/dL': 88.4 },
    min: 10,
    max: 3000,
  },
  '38483-4': {
    fields: ['creatinineUmolL'],
    canonicalUnit: 'umol/L',
    units: { 'umol/l': 1, 'µmol/l': 1, 'mg/dl': 88.4 },
    min: 10,
    max: 3000,
  },
  '14682-9': {
    fields: ['creatinineUmolL'],
    canonicalUnit: 'umol/L',
    units: { 'umol/l': 1, 'µmol/l': 1, 'mg/dl': 88.4 },
    min: 10,
    max: 3000,
  },
  '33914-3': {
    fields: ['egfrMlMin', 'eGFR'],
    canonicalUnit: 'mL/min/{1.73_m2}',
    units: { 'ml/min/{1.73_m2}': 1, 'ml/min/1.73m2': 1, 'ml/min': 1, '': 1 },
    min: 1,
    max: 200,
  },
  '62238-1': {
    fields: ['egfrMlMin', 'eGFR'],
    canonicalUnit: 'mL/min/{1.73_m2}',
    units: { 'ml/min/{1.73_m2}': 1, 'ml/min/1.73m2': 1, 'ml/min': 1, '': 1 },
    min: 1,
    max: 200,
  },
  '48642-3': {
    fields: ['egfrMlMin', 'eGFR'],
    canonicalUnit: 'mL/min/{1.73_m2}',
    units: { 'ml/min/{1.73_m2}': 1, 'ml/min/1.73m2': 1, 'ml/min': 1, '': 1 },
    min: 1,
    max: 200,
  },
  '3094-0': {
    fields: ['ureaMmolL', 'urea'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.357 },
    min: 0.5,
    max: 80,
  },
  '22664-7': {
    fields: ['ureaMmolL', 'urea'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.1665 },
    min: 0.5,
    max: 80,
  },

  // ---- Electrolytes / gases ----
  '2823-3': {
    fields: ['potassiumMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'meq/l': 1 },
    min: 1,
    max: 10,
  },
  '2951-2': {
    fields: ['sodiumMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'meq/l': 1 },
    min: 90,
    max: 200,
  },
  '1963-8': {
    fields: ['bicarbonateMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'meq/l': 1 },
    min: 1,
    max: 50,
  },
  '2524-7': {
    fields: ['lactateMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.111 },
    min: 0.1,
    max: 30,
  },
  '32693-4': {
    fields: ['lactateMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.111 },
    min: 0.1,
    max: 30,
  },
  '11558-4': {
    fields: ['venousPh'],
    canonicalUnit: 'pH',
    units: { '[ph]': 1, ph: 1, '': 1 },
    min: 6.5,
    max: 7.8,
  },

  // ---- Haematology ----
  '718-7': {
    fields: ['haemoglobinGdl', 'hb'],
    canonicalUnit: 'g/dL',
    units: { 'g/dl': 1, 'g/l': 0.1, 'mmol/l': 1.611 },
    min: 1,
    max: 25,
  },
  '20570-8': {
    fields: ['haematocritPercent'],
    canonicalUnit: '%',
    units: PERCENT,
    min: 5,
    max: 70,
  },
  '777-3': {
    fields: ['plateletCount'],
    canonicalUnit: '10*9/L',
    units: { '10*9/l': 1, '10*3/ul': 1, 'k/ul': 1, '/ul': 0.001 },
    min: 1,
    max: 2000,
  },

  // ---- Metabolic ----
  '2345-7': {
    fields: ['plasmaGlucoseMmolL', 'bloodGlucoseMmolL', 'randomGlucoseMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.0555 },
    min: 0.5,
    max: 60,
  },
  '2339-0': {
    fields: ['bloodGlucoseMmolL', 'fingerStickGlucoseMmolL', 'randomGlucoseMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.0555 },
    min: 0.5,
    max: 60,
  },
  '15074-8': {
    fields: ['bloodGlucoseMmolL', 'randomGlucoseMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.0555 },
    min: 0.5,
    max: 60,
  },
  '1558-6': {
    fields: ['fastingGlucoseMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.0555 },
    min: 0.5,
    max: 60,
  },
  '4548-4': {
    fields: ['hba1cPercent', 'recentHbA1cPercent'],
    canonicalUnit: '%',
    units: PERCENT,
    min: 3,
    max: 20,
  },
  '2093-3': {
    fields: ['totalCholesterolMmolL'],
    canonicalUnit: 'mmol/L',
    units: { 'mmol/l': 1, 'mg/dl': 0.02586 },
    min: 1,
    max: 30,
  },

  // ---- Hepatic ----
  '1742-6': {
    fields: ['altIuL'],
    canonicalUnit: 'U/L',
    units: { 'u/l': 1, 'iu/l': 1 },
    min: 1,
    max: 20000,
  },
  '1920-8': {
    fields: ['astIuL'],
    canonicalUnit: 'U/L',
    units: { 'u/l': 1, 'iu/l': 1 },
    min: 1,
    max: 20000,
  },
  '1975-2': {
    fields: ['totalBilirubinMgDl'],
    canonicalUnit: 'mg/dL',
    units: { 'mg/dl': 1, 'umol/l': 0.05847, 'µmol/l': 0.05847 },
    min: 0.05,
    max: 80,
  },
  '1968-7': {
    fields: ['directBilirubinMgDl'],
    canonicalUnit: 'mg/dL',
    units: { 'mg/dl': 1, 'umol/l': 0.05847, 'µmol/l': 0.05847 },
    min: 0.01,
    max: 60,
  },

  // ---- Endocrine ----
  '3016-3': {
    fields: ['tsh'],
    canonicalUnit: 'mIU/L',
    units: { 'miu/l': 1, 'uiu/ml': 1, 'µiu/ml': 1 },
    min: 0.001,
    max: 500,
  },
  '3024-7': {
    fields: ['freeT4'],
    canonicalUnit: 'pmol/L',
    units: { 'pmol/l': 1, 'ng/dl': 12.87 },
    min: 0.5,
    max: 200,
  },
};

/**
 * BP panel LOINCs: the systolic/diastolic values live in `component`,
 * not on the Observation itself. Listed so the reader knows to recurse.
 */
export const BP_PANEL_LOINCS = new Set(['85354-9', '55284-4', '35094-2']);

/** Normalises a UCUM code or display unit for table lookup. */
export function normaliseUnit(q: { unit?: string; code?: string } | undefined): string {
  const raw = q?.code ?? q?.unit ?? '';
  return String(raw).trim().toLowerCase();
}

/**
 * Converts an observation value into the mapping's canonical unit.
 * Returns null when the unit is unrecognised or the converted value
 * falls outside the mapping's sanity bounds — both mean "do not
 * populate the field", never "populate it with a guess".
 */
export function convert(mapping: ObservationMapping, value: number, unit: string): number | null {
  if (!Number.isFinite(value)) return null;

  let converted: number | null = null;

  // Temperature is the one affine conversion — Fahrenheit has an offset.
  if (
    mapping.canonicalUnit === 'Cel' &&
    (unit === '[degf]' || unit === 'degf' || unit === 'f' || unit === '°f')
  ) {
    converted = ((value - 32) * 5) / 9;
  } else {
    const factor = mapping.units[unit];
    if (factor === undefined) return null;
    converted = value * factor;
  }

  if (mapping.min !== undefined && converted < mapping.min) return null;
  if (mapping.max !== undefined && converted > mapping.max) return null;

  // Guard against float dust from the conversion factors (88.4, 0.0555…).
  return Math.round(converted * 1000) / 1000;
}
