import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Hyperosmolar Hyperglycaemic State (HHS) — Joint British Diabetes
 * Societies (JBDS-IP) HHS Guideline 2022 + American Diabetes
 * Association Standards of Care 2024 + WHO PEN HEARTS.
 *
 *   Diagnostic criteria (all three required):
 *     • Hypovolaemia
 *     • Marked hyperglycaemia (≥ 30 mmol/L)
 *     • Hyperosmolality (serum osmolality ≥ 320 mOsm/kg)
 *   WITHOUT significant ketonaemia (< 3 mmol/L) or acidosis
 *   (pH > 7.30, bicarbonate > 15 mmol/L).
 *
 *   Severity overlays:
 *     • Osmolality ≥ 350, sodium ≥ 160, K outside 3.5–6.0, GCS ≤ 12,
 *       pH < 7.10, SBP < 90 (after fluids), pulse < 60 / > 100,
 *       O₂ sat < 92 % → critical-care input.
 *
 *   Anonymous-by-design context:
 *     suspectedHhs                 boolean (sentinel)
 *     ageYears                     number
 *     weightKg                     number (optional, for fluid calculation)
 *     plasmaGlucoseMmolL           number
 *     bloodKetonesMmolL            number (optional)
 *     venousPh                     number (optional)
 *     bicarbonateMmolL             number (optional)
 *     sodiumMmolL                  number (optional)
 *     potassiumMmolL               number (optional)
 *     calculatedOsmolMosmKg        number (optional)
 *     gcs                          number (optional)
 *     systolicMmHg                 number (optional)
 *     pulsePerMin                  number (optional)
 *     oxygenSatPercent             number (optional)
 *     suspectedPrecipitant         string (optional)
 */

const HHS_GLUCOSE = 30;
const HHS_OSMOL = 320;
const HHS_OSMOL_SEVERE = 350;
const HHS_KETONE_MAX = 3.0;
const HHS_PH_MIN = 7.30;
const HHS_BICARB_MIN = 15;
const SEVERE_NA = 160;
const SEVERE_K_LOW = 3.5;
const SEVERE_K_HIGH = 6.0;
const SEVERE_GCS = 12;
const SEVERE_SBP = 90;
const SEVERE_SAT = 92;

interface HhsContext {
  suspectedHhs?: boolean;
  ageYears?: number;
  weightKg?: number;
  plasmaGlucoseMmolL?: number;
  bloodKetonesMmolL?: number;
  venousPh?: number;
  bicarbonateMmolL?: number;
  sodiumMmolL?: number;
  potassiumMmolL?: number;
  calculatedOsmolMosmKg?: number;
  gcs?: number;
  systolicMmHg?: number;
  pulsePerMin?: number;
  oxygenSatPercent?: number;
  suspectedPrecipitant?: string;
}

function osmolality(ctx: HhsContext): number | undefined {
  if (typeof ctx.calculatedOsmolMosmKg === 'number') return ctx.calculatedOsmolMosmKg;
  if (
    typeof ctx.sodiumMmolL === 'number' &&
    typeof ctx.plasmaGlucoseMmolL === 'number'
  ) {
    // 2(Na+) + glucose + urea — urea is small in HHS; default to 5 if not given.
    return 2 * ctx.sodiumMmolL + ctx.plasmaGlucoseMmolL + 5;
  }
  return undefined;
}

const CODINGS_BASE: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'E14.0', display: 'Diabetes mellitus with coma (HHS / hyperosmolar)', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'E11.0', display: 'Type 2 diabetes mellitus with hyperosmolarity', kind: 'diagnosis' },
  { system: 'http://id.who.int/icd/release/11/mms', code: '5A21', display: 'Hyperosmolar hyperglycaemic state', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '421750000', display: 'Hyperosmolar hyperglycaemic non-ketotic syndrome (disorder)', kind: 'diagnosis' },
  { system: 'http://loinc.org', code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', kind: 'lab' },
  { system: 'http://loinc.org', code: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', kind: 'lab' },
];

@Injectable()
export class HhsRecognitionStrategy implements CdsRuleStrategy {
  readonly type = 'hhs-recognition';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HhsContext;
    if (ctx.suspectedHhs !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < 12) return [];

    const glu = ctx.plasmaGlucoseMmolL;
    const osm = osmolality(ctx);
    const ket = ctx.bloodKetonesMmolL;
    const ph = ctx.venousPh;
    const bic = ctx.bicarbonateMmolL;

    const hyperglycaemic = typeof glu === 'number' && glu >= HHS_GLUCOSE;
    const hyperosmolar = typeof osm === 'number' && osm >= HHS_OSMOL;
    const notKetoacidotic =
      (typeof ket !== 'number' || ket < HHS_KETONE_MAX) &&
      (typeof ph !== 'number' || ph >= HHS_PH_MIN) &&
      (typeof bic !== 'number' || bic >= HHS_BICARB_MIN);

    if (hyperglycaemic && hyperosmolar && notKetoacidotic) {
      const cards: CdsCard[] = [this.bundleCard(rule, req, ctx, osm)];
      const severityReasons: string[] = [];
      if (typeof osm === 'number' && osm >= HHS_OSMOL_SEVERE) {
        severityReasons.push(`osmolality ${osm.toFixed(0)} mOsm/kg (≥ ${HHS_OSMOL_SEVERE})`);
      }
      if (typeof ctx.sodiumMmolL === 'number' && ctx.sodiumMmolL >= SEVERE_NA) {
        severityReasons.push(`Na⁺ ${ctx.sodiumMmolL.toFixed(0)} mmol/L (≥ ${SEVERE_NA})`);
      }
      if (
        typeof ctx.potassiumMmolL === 'number' &&
        (ctx.potassiumMmolL < SEVERE_K_LOW || ctx.potassiumMmolL > SEVERE_K_HIGH)
      ) {
        severityReasons.push(`K⁺ ${ctx.potassiumMmolL.toFixed(1)} mmol/L (outside 3.5–6.0)`);
      }
      if (typeof ctx.gcs === 'number' && ctx.gcs <= SEVERE_GCS) {
        severityReasons.push(`GCS ${ctx.gcs} (≤ ${SEVERE_GCS})`);
      }
      if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SEVERE_SBP) {
        severityReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< ${SEVERE_SBP} after fluids)`);
      }
      if (typeof ctx.oxygenSatPercent === 'number' && ctx.oxygenSatPercent < SEVERE_SAT) {
        severityReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< ${SEVERE_SAT})`);
      }
      if (severityReasons.length > 0) {
        cards.push(this.severityCard(rule, req, severityReasons));
      }
      return cards;
    }

    // Partial picture (e.g., ketones present but high glucose) — flag as DKA-overlap.
    if (typeof glu === 'number' && glu >= HHS_GLUCOSE && typeof ket === 'number' && ket >= HHS_KETONE_MAX) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Mixed HHS / DKA picture — manage as DKA priority, watch osmolality',
          'Glucose {{glu}} mmol/L with ketones {{ket}} mmol/L. About one-third of presentations overlap. Manage primarily as DKA ' +
            '(fixed-rate insulin 0.05–0.1 U/kg/h, fluids, K⁺ replacement) but correct the osmolality slowly (target fall ≤ 5 mOsm/kg/h) ' +
            'to avoid central pontine myelinolysis and cerebral oedema. Use the more cautious HHS fluid plan if osmolality ≥ 320.',
          { glu: glu.toFixed(1), ket: ket.toFixed(1) },
          CODINGS_BASE,
        ),
      ];
    }

    return [];
  }

  private bundleCard(rule: CdsRule, req: CdsHookRequest, ctx: HhsContext, osm: number | undefined): CdsCard {
    const wt = ctx.weightKg;
    const firstHourBolus = typeof wt === 'number' ? `${(15 * wt).toFixed(0)} mL` : '500–1000 mL';
    const insulinStart =
      typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL < 3.5
        ? 'Withhold insulin until K⁺ ≥ 3.5 mmol/L (give K⁺ replacement first; severe risk of fatal arrhythmia).'
        : typeof wt === 'number'
          ? `Start fixed-rate insulin infusion 0.05 U/kg/h = ${(0.05 * wt).toFixed(1)} U/h ONLY once fluids are running for at least 60 minutes AND blood glucose has stopped falling with fluid alone OR ketones are present.`
          : 'Start fixed-rate insulin infusion 0.05 U/kg/h (lower than DKA — 0.1 U/kg/h causes rapid osmolal shift) ONLY once fluids running ≥ 60 min and glucose has stopped falling, OR ketones rise.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Hyperosmolar Hyperglycaemic State — initiate JBDS bundle',
      'Diagnostic triad met (glucose ≥ 30 mmol/L, osmolality {{osm}} mOsm/kg, ketones / pH / bicarbonate within HHS limits). Goals ' +
        '(JBDS 2022): correct hypovolaemia, slowly reduce osmolality by ≤ 5 mOsm/kg/h (corresponds to fall in plasma glucose of ≤ 5 ' +
        'mmol/L/h and Na⁺ ≤ 10 mmol/L/24 h), reverse hyperglycaemia, replace K⁺, prevent VTE / cerebral oedema. Fluids: IV 0.9 % NaCl ' +
        '{{bolus}} over the first hour, then approximately 1 L every 2 hours adjusted to target restoration of fluid deficit (typical ' +
        'deficit 100–220 mL/kg). Switch to 0.45 % NaCl ONLY if osmolality is not falling despite a positive fluid balance AND ' +
        'corrected sodium is rising. Add 5 % dextrose when glucose falls below 14 mmol/L. {{insulin}} Potassium: 40 mmol/L in IV ' +
        'fluids when K⁺ 3.5–5.5; withhold K⁺ when > 5.5 with ECG monitoring. Prophylactic LMWH (enoxaparin 40 mg SC daily) — VTE ' +
        'rates in HHS are very high; consider treatment-dose if confirmed thrombosis. Investigate precipitant ({{precipitant}}): ' +
        'infection (cultures + early broad-spectrum antibiotic), silent MI (ECG + troponin), stroke, missed glucose-lowering therapy, ' +
        'steroid load, dehydration in elderly. Reassess every hour for the first 12 hours then 2-hourly.',
      {
        osm: typeof osm === 'number' ? osm.toFixed(0) : 'pending',
        bolus: firstHourBolus,
        insulin: insulinStart,
        precipitant: ctx.suspectedPrecipitant ?? 'screen for infection / MI / stroke',
      },
      CODINGS_BASE,
    );
  }

  private severityCard(rule: CdsRule, req: CdsHookRequest, reasons: string[]): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'Severe HHS feature(s) — critical-care input now',
      'High-risk feature(s): {{reasons}}. Activate ICU / HDU referral, central monitoring, hourly osmolality and electrolytes ' +
        'for the first 12 hours. Aim a fall in corrected sodium of ≤ 10 mmol/L over 24 h. In the obtunded patient consider an ' +
        'NG tube for ileus, urinary catheter for strict input/output, and continuous cardiac monitoring. Mortality is 10–20 % — ' +
        'do not under-resuscitate but do not over-correct.',
      { reasons: reasons.join('; ') },
      CODINGS_BASE,
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
    codings: CodedReference[],
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'JBDS-IP — The management of the hyperosmolar hyperglycaemic state in adults with diabetes (2022)',
      url: 'https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_06_The_Management_of_the_Hyperosmolar_Hyperglycaemic_State_HHS_in_Adults_with_Diabetes_FINAL_28032022.pdf',
    };
    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      vars,
    );
    return {
      summary,
      indicator,
      detail: detail.replace(/\s+/g, ' ').trim(),
      source: { label: ref.label, url: ref.url, strength: ref.strength },
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          evidenceLevel: rule.evidenceLevel,
          generatedAt: new Date().toISOString(),
          codings,
        },
      },
    };
  }
}
