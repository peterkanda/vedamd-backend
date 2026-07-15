import type {
  CalculatedDose,
  DosingInput,
  DosingResult,
  DrugRecord,
  PaediatricDosing,
  RenalAdjustment,
} from './drugs.types';

const ADULT_THRESHOLD_KG = 50;
const ADULT_THRESHOLD_YEARS = 12;

/**
 * Round a milligram dose to clinically meaningful precision WITHOUT
 * collapsing small-but-real doses to zero.
 *
 * Rounding to whole mg (the previous behaviour) turned genuine
 * sub-milligram doses — adrenaline 0.05 mg, naloxone 0.05 mg, morphine
 * 0.5 mg in a small child — into "0 mg" or a doubled value. Precision is
 * scaled by magnitude so large doses stay whole (paracetamol 210 mg) and
 * micro-doses keep the digits that matter (0.05 mg, not 0 mg):
 *   ≥ 10 mg  → nearest whole mg
 *   1–10 mg  → 0.1 mg
 *   < 1 mg   → 0.001 mg (1 microgram)
 */
export function roundDose(mg: number): number {
  if (!Number.isFinite(mg) || mg <= 0) return 0;
  if (mg >= 10) return Math.round(mg);
  if (mg >= 1) return Math.round(mg * 10) / 10;
  return Math.round(mg * 1000) / 1000;
}

/**
 * Deterministic dosing algorithm. Reads only from the structured drug
 * record — no LLM, no free-text parsing of the regimen string. Always
 * returns a result; the protocol field tells the caller what kind of
 * answer they received.
 *
 * Safety posture: the calculator will refuse to return a calculated mg
 * dose whenever (a) the drug is flagged individualised, (b) the drug
 * has no applicable protocol for the supplied age/weight, or (c) the
 * supplied CrCl falls in a renal-adjustment band marked prohibited.
 * The narrative and warnings always reflect what was decided.
 */
export function calculateDose(drug: DrugRecord, inputs: DosingInput): DosingResult {
  const baseResult: Omit<DosingResult, 'protocol' | 'narrative'> = {
    slug: drug.slug,
    inputs,
    warnings: [],
    contraindications: [],
    references: drug.references,
    ruleVersion: drug.ruleVersion,
    evidenceLevel: drug.evidenceLevel,
    reviewStatus: drug.reviewStatus,
  };

  // 1. Individualised drugs (e.g., warfarin) — never compute a mg dose.
  if (drug.dosing.individualised) {
    const regimen = drug.dosing.adult[0]?.regimen ?? '';
    return {
      ...baseResult,
      protocol: 'individualised',
      narrative:
        `Dosing for ${drug.inn} is individualised and not safe to calculate from weight alone. ` +
        `Adult guidance: ${regimen}`,
      warnings: [...baseResult.warnings, ...drug.warnings],
    };
  }

  // 2. Renal contraindication beats any other branch.
  const renalHit = matchRenal(drug.dosing.renal, inputs.crClMlMin);
  if (renalHit?.prohibited) {
    return {
      ...baseResult,
      protocol: 'not-applicable',
      narrative: `Dosing refused: ${renalHit.adjustment}`,
      contraindications: [renalHit.adjustment, ...drug.contraindications],
    };
  }

  // 3. Choose adult vs paediatric path.
  //
  // Age is authoritative when supplied: a child under the age threshold
  // is dosed on the paediatric path REGARDLESS of weight, because the
  // paediatric mg/kg path applies the adult single-dose cap (maxMgPerDose)
  // and so cannot overdose a large child — whereas routing that child to
  // the adult path would hand them a full adult regimen. Only when age is
  // absent do we fall back to the 50 kg weight heuristic, and we flag that
  // the routing was inferred so the caller knows age was missing.
  const hasAge = inputs.ageYears !== undefined;
  const useAdult = hasAge
    ? (inputs.ageYears as number) >= ADULT_THRESHOLD_YEARS
    : inputs.weightKg >= ADULT_THRESHOLD_KG;

  if (!hasAge) {
    baseResult.warnings = [
      ...baseResult.warnings,
      `Age not supplied — adult/paediatric routing was inferred from weight ` +
        `(${inputs.weightKg} kg ${useAdult ? '≥' : '<'} ${ADULT_THRESHOLD_KG} kg). ` +
        `Supply age for a reliable calculation.`,
    ];
  }

  if (!useAdult) {
    return paediatricResult(drug, inputs, baseResult, renalHit);
  }

  return adultResult(drug, inputs, baseResult, renalHit);
}

function paediatricResult(
  drug: DrugRecord,
  inputs: DosingInput,
  base: Omit<DosingResult, 'protocol' | 'narrative'>,
  renalHit: RenalAdjustment | null,
): DosingResult {
  const paed = drug.dosing.paediatric;
  if (!paed) {
    return {
      ...base,
      protocol: 'not-applicable',
      narrative: `${drug.inn} has no paediatric dosing protocol on file in this content version.`,
      warnings: [
        ...base.warnings,
        'No paediatric protocol available — consult a senior clinician.',
      ],
    };
  }

  // Weight-banded protocol (no usable mg/kg figure) — surface the narrative.
  // A non-positive mgPerKgPerDose is a sentinel for "not mg/kg-dosed" (ORS,
  // insulin, IV fluids, topicals, vitamins): computing weight × 0 would
  // otherwise emit a dangerous 0 mg dose, so route these to the narrative.
  if (paed.mgPerKgPerDose === undefined || paed.mgPerKgPerDose <= 0) {
    // The real regimen for these lives in route/frequency (e.g. "20 mL/kg
    // bolus", "0.05–0.1 U/kg/h"); fall back to it when there's no free-text
    // note, so the narrative is never empty.
    const detail = paed.notes ?? [paed.route, paed.frequency].filter(Boolean).join(' — ').trim();
    return {
      ...base,
      protocol: 'weight-banded',
      narrative:
        (detail || `${drug.inn}: see paediatric protocol.`) +
        (paed.minWeightKg !== undefined ? ` Minimum weight ${paed.minWeightKg} kg.` : ''),
      warnings:
        paed.minWeightKg !== undefined && inputs.weightKg < paed.minWeightKg
          ? [
              ...base.warnings,
              `Weight ${inputs.weightKg} kg is below the minimum ${paed.minWeightKg} kg for this regimen.`,
            ]
          : base.warnings,
    };
  }

  // mg/kg/dose path.
  return computePaediatricMgPerKg(drug, inputs, base, paed, renalHit);
}

function computePaediatricMgPerKg(
  drug: DrugRecord,
  inputs: DosingInput,
  base: Omit<DosingResult, 'protocol' | 'narrative'>,
  paed: PaediatricDosing,
  renalHit: RenalAdjustment | null,
): DosingResult {
  const raw = inputs.weightKg * (paed.mgPerKgPerDose as number);
  const caps: string[] = [];

  let mgPerDose = raw;
  if (paed.maxMgPerDose !== undefined && mgPerDose > paed.maxMgPerDose) {
    mgPerDose = paed.maxMgPerDose;
    caps.push(`Single-dose cap of ${paed.maxMgPerDose} mg applied.`);
  }

  const roundedMgPerDose = roundDose(mgPerDose);

  // Defence in depth: a real, positive dose must never be presented as
  // "0 mg". If precision rounding still collapses to zero (implausibly
  // tiny mg/kg figure, or a corrupt record), refuse to emit a mg dose and
  // hand back the narrative instead of a dangerous zero.
  if (mgPerDose > 0 && roundedMgPerDose <= 0) {
    return {
      ...base,
      protocol: 'not-applicable',
      narrative:
        `${drug.inn}: computed paediatric dose is below the representable ` +
        `precision for this content version — do not infer 0 mg. ` +
        `${paed.route} ${paed.frequency}`.trim(),
      warnings: [
        ...base.warnings,
        'Calculated dose too small to represent safely — verify manually.',
      ],
    };
  }

  const maxMgPerDay = paed.maxMgPerKgPerDay
    ? roundDose(paed.maxMgPerKgPerDay * inputs.weightKg)
    : undefined;

  const dose: CalculatedDose = {
    mgPerDose: roundedMgPerDose,
    route: paed.route,
    frequency: renalHit?.adjustment ?? paed.frequency,
    maxMgPerDay,
    capsApplied: caps,
  };

  const indicationNote = matchIndicationNote(drug, inputs.indication);
  const renalNote =
    renalHit && !renalHit.prohibited ? ` Renal adjustment applied: ${renalHit.adjustment}` : '';

  return {
    ...base,
    protocol: 'paediatric',
    calculatedDose: dose,
    narrative:
      `Paediatric dose: ${dose.mgPerDose} mg ${paed.route} ` +
      `${renalHit?.adjustment ?? paed.frequency}` +
      (maxMgPerDay ? `; do not exceed ${maxMgPerDay} mg in 24 h.` : '.') +
      (indicationNote ? ` ${indicationNote}` : '') +
      renalNote,
    warnings:
      paed.minWeightKg !== undefined && inputs.weightKg < paed.minWeightKg
        ? [
            ...base.warnings,
            `Weight ${inputs.weightKg} kg is below the minimum ${paed.minWeightKg} kg for this regimen.`,
          ]
        : base.warnings,
  };
}

function adultResult(
  drug: DrugRecord,
  inputs: DosingInput,
  base: Omit<DosingResult, 'protocol' | 'narrative'>,
  renalHit: RenalAdjustment | null,
): DosingResult {
  const first = drug.dosing.adult[0];
  if (!first) {
    return {
      ...base,
      protocol: 'not-applicable',
      narrative: `${drug.inn} has no adult dosing on file in this content version.`,
    };
  }

  const renalNote =
    renalHit && !renalHit.prohibited ? ` Renal adjustment applied: ${renalHit.adjustment}` : '';
  const indicationNote = matchIndicationNote(drug, inputs.indication);

  return {
    ...base,
    protocol: 'adult',
    narrative:
      `Adult regimen: ${first.regimen}` +
      (first.notes ? ` (${first.notes})` : '') +
      renalNote +
      (indicationNote ? ` ${indicationNote}` : ''),
    warnings: [...base.warnings, ...drug.warnings],
  };
}

export function matchRenal(
  bands: RenalAdjustment[] | undefined,
  crClMlMin: number | undefined,
): RenalAdjustment | null {
  if (!bands || crClMlMin === undefined) return null;
  for (const band of bands) {
    const okLower = band.crClMinMlMin === undefined || crClMlMin >= band.crClMinMlMin;
    const okUpper = band.crClMaxMlMin === undefined || crClMlMin < band.crClMaxMlMin;
    if (okLower && okUpper) return band;
  }
  return null;
}

function matchIndicationNote(drug: DrugRecord, indication: string | undefined): string | null {
  if (!indication) return null;
  const needle = indication.toLowerCase();
  // Surface the paediatric notes if they look indication-specific.
  const note = drug.dosing.paediatric?.notes;
  if (!note) return null;
  if (note.toLowerCase().includes(needle.split(' ')[0])) {
    return `Indication note: ${note}`;
  }
  return null;
}
