import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Heart-failure acute decompensation (ESC 2023 + WHO PEN-HEARTS).
 *
 *   Sentinel-gated by `suspectedHeartFailureDecompensation`. The
 *   integrator confirms there is a clinical concern for HF
 *   decompensation (new or worsening dyspnoea, weight gain, peripheral
 *   oedema in a patient with known or suspected HF).
 *
 *   Severity ladder:
 *
 *     1. CRITICAL — cardiogenic shock features OR severe respiratory
 *        failure:
 *          • SBP < 90 OR signs of hypoperfusion (cold mottled limbs,
 *            oliguria, altered mentation)
 *          • SpO₂ < 90 on room air OR severe respiratory distress
 *          • Acute pulmonary oedema with pink frothy sputum
 *        → IV diuretic (furosemide 40–80 mg or 2.5 × usual oral dose),
 *          nitrate infusion if SBP > 110 (avoid in inferior RV
 *          infarct), CPAP/NIV for pulmonary oedema, vasopressors +
 *          urgent ICU consult for shock.
 *
 *     2. CRITICAL — concerning acute decompensation:
 *          • Orthopnoea / paroxysmal nocturnal dyspnoea
 *          • Bilateral basal crackles
 *          • Acute weight gain ≥ 2 kg in the last 3 days
 *          • Jugular venous distension > 5 cm above the sternal angle
 *        → Admit, IV furosemide, restrict salt + fluid, reassess
 *          diuretic-resistance, optimise GDMT (guideline-directed
 *          medical therapy): ACE inhibitor / ARB / ARNI, beta-blocker,
 *          MRA (spironolactone) — start with one if naive, titrate
 *          all three; check K+ before ACE / MRA.
 *
 *     3. WARNING — early or non-severe decompensation:
 *          fatigue, mild oedema, mild weight gain. Optimise outpatient
 *          GDMT, increase loop diuretic by 50 %, daily weights, review
 *          in 3–7 days.
 *
 *     4. INFO — no decompensation features. Reinforce self-management.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                      number ≥ 18
 *   context.suspectedHeartFailureDecompensation  boolean (sentinel)
 *   context.systolicMmHg                  number (optional)
 *   context.heartRatePerMin               number (optional)
 *   context.oxygenSatPercent              number (optional)
 *   context.respiratoryRatePerMin         number (optional)
 *   context.hypoperfusionSigns            boolean (cold, mottled,
 *                                          oliguric, altered mentation)
 *   context.pulmonaryOedemaPinkFrothy     boolean
 *   context.orthopnoeaOrPnd               boolean
 *   context.bilateralBasalCrackles        boolean
 *   context.recentWeightGainKg            number 0..20 (last 3 days)
 *   context.jvpRaised                     boolean
 *   context.peripheralOedema              boolean
 *   context.knownEjectionFractionPercent  number (optional, informs GDMT)
 *   context.knownRvInfarct                boolean (optional — avoid
 *                                          nitrates / preload reduction)
 *   context.potassiumMmolL                number (optional — GDMT gate)
 */

const ADULT_AGE_YEARS = 18;
const SHOCK_SBP = 90;
const SEVERE_SPO2 = 90;
const SEVERE_RR = 30;
const ACUTE_WEIGHT_GAIN_KG = 2;
const HIGH_K_MMOLL = 5.5;

interface HfContext {
  ageYears?: number;
  suspectedHeartFailureDecompensation?: boolean;
  systolicMmHg?: number;
  heartRatePerMin?: number;
  oxygenSatPercent?: number;
  respiratoryRatePerMin?: number;
  hypoperfusionSigns?: boolean;
  pulmonaryOedemaPinkFrothy?: boolean;
  orthopnoeaOrPnd?: boolean;
  bilateralBasalCrackles?: boolean;
  recentWeightGainKg?: number;
  jvpRaised?: boolean;
  peripheralOedema?: boolean;
  knownEjectionFractionPercent?: number;
  knownRvInfarct?: boolean;
  potassiumMmolL?: number;
}

@Injectable()
export class HeartFailureDecompensationStrategy implements CdsRuleStrategy {
  readonly type = 'heart-failure-decompensation';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HfContext;
    if (ctx.suspectedHeartFailureDecompensation !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const shockReasons: string[] = [];
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SHOCK_SBP) {
      shockReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< ${SHOCK_SBP})`);
    }
    if (ctx.hypoperfusionSigns === true) {
      shockReasons.push('hypoperfusion (cold mottled limbs, oliguria, altered mentation)');
    }
    if (
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < SEVERE_SPO2
    ) {
      shockReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< ${SEVERE_SPO2})`);
    }
    if (
      typeof ctx.respiratoryRatePerMin === 'number' &&
      ctx.respiratoryRatePerMin >= SEVERE_RR
    ) {
      shockReasons.push(`RR ${ctx.respiratoryRatePerMin}/min (≥ ${SEVERE_RR})`);
    }
    if (ctx.pulmonaryOedemaPinkFrothy === true) shockReasons.push('pink frothy sputum');

    if (shockReasons.length > 0) {
      const nitrateLine =
        ctx.knownRvInfarct === true
          ? 'AVOID nitrates / aggressive preload reduction — RV-infarct dependence on preload is known.'
          : typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg > 110
            ? 'Start IV nitrate infusion (glyceryl trinitrate 5–10 µg/min titrated to symptoms) if SBP remains > 110.'
            : 'Withhold nitrates while SBP ≤ 110.';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Cardiogenic shock / acute pulmonary oedema — activate emergency bundle',
          'High-risk feature(s): {{reasons}}. Bundle: sit the patient upright, high-flow oxygen titrated to SpO₂ 94–98 %, ' +
            'CPAP / NIV for cardiogenic pulmonary oedema with respiratory distress. IV furosemide bolus 40–80 mg (or 2.5 × ' +
            'the usual oral dose), repeated every 2–4 h, or continuous infusion 5–10 mg/h titrated to urine output > 1 mL/kg/h. ' +
            '{{nitrate}} If cardiogenic shock with hypoperfusion, start a noradrenaline infusion (0.05–0.5 µg/kg/min) titrated ' +
            'to MAP ≥ 65; add inotrope (dobutamine 2.5–10 µg/kg/min) where contractility is the limiting factor. Urgent ECG / ' +
            'troponin (rule out ACS), CXR, ABG, point-of-care echo. Refer ICU.',
          { reasons: shockReasons.join('; '), nitrate: nitrateLine },
        ),
      ];
    }

    const decompReasons: string[] = [];
    if (ctx.orthopnoeaOrPnd === true) decompReasons.push('orthopnoea / paroxysmal nocturnal dyspnoea');
    if (ctx.bilateralBasalCrackles === true) decompReasons.push('bilateral basal crackles');
    if (typeof ctx.recentWeightGainKg === 'number' && ctx.recentWeightGainKg >= ACUTE_WEIGHT_GAIN_KG) {
      decompReasons.push(`weight gain ${ctx.recentWeightGainKg.toFixed(1)} kg in 3 days`);
    }
    if (ctx.jvpRaised === true) decompReasons.push('raised JVP');

    if (decompReasons.length > 0) {
      const gdmtLine = gdmtRecommendation(ctx);
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Acute heart-failure decompensation — admit and optimise diuresis',
          'Decompensation feature(s): {{reasons}}. Admit. IV furosemide 40 mg bolus (or 2.5 × usual oral dose); repeat in ' +
            '2–4 h if response inadequate. Restrict sodium to < 2 g/day and fluid to 1.5 L/day. Daily weights and strict ' +
            'fluid balance. Investigate precipitant (non-adherence, salt or alcohol load, infection, AF / arrhythmia, ' +
            'silent ACS, anaemia, thyrotoxicosis, NSAIDs). {{gdmt}}',
          { reasons: decompReasons.join('; '), gdmt: gdmtLine },
        ),
      ];
    }

    if (ctx.peripheralOedema === true ||
      (typeof ctx.recentWeightGainKg === 'number' && ctx.recentWeightGainKg > 0)) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Early decompensation — outpatient diuretic step-up + close follow-up',
          'Non-severe features (mild oedema or sub-2 kg weight gain). Increase the loop diuretic by 50 % for 3 days (e.g. ' +
            'furosemide 40 → 60 mg morning + 20 mg evening). Daily weights with a written sliding scale; counsel a "yellow / ' +
            'red zone" plan (gain > 2 kg in 3 days OR breathless at rest = re-present). Optimise GDMT; review serum K⁺ and ' +
            'creatinine within 1 week of any change. Telephone or clinic review in 3–7 days.',
          {},
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'No decompensation features at this contact — reinforce self-management',
        'No high-risk or decompensation features. Reinforce daily weights, salt and fluid limits, medication adherence, ' +
          'and the action plan. Confirm GDMT is at target doses; vaccinate against influenza and pneumococcus.',
        {},
      ),
    ];
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'ESC Guidelines for Heart Failure (2023 focused update)',
      url: 'https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Heart-Failure-Guidelines',
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
      source: { label: ref.label, url: ref.url },
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          evidenceLevel: rule.evidenceLevel,
          generatedAt: new Date().toISOString(),
        },
      },
    };
  }
}

function gdmtRecommendation(ctx: HfContext): string {
  const ef = ctx.knownEjectionFractionPercent;
  const hyperK =
    typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL >= HIGH_K_MMOLL;
  if (typeof ef === 'number' && ef < 40) {
    const kLine = hyperK
      ? ` Potassium ${ctx.potassiumMmolL!.toFixed(1)} mmol/L — withhold ACE inhibitor / ARB / MRA until corrected.`
      : '';
    return (
      `Reduced-EF (LVEF ${ef}%): start or up-titrate all four pillars when haemodynamically stable — ` +
      'ACE inhibitor / ARB (or ARNI sacubitril-valsartan), beta-blocker (carvedilol / bisoprolol / metoprolol succinate), ' +
      'MRA (spironolactone 25 mg or eplerenone), SGLT2 inhibitor (dapagliflozin 10 mg or empagliflozin 10 mg). Up-titrate ' +
      'over 2–4 weeks targeting heart rate 60–70 / SBP > 90.' + kLine
    );
  }
  if (typeof ef === 'number' && ef >= 40) {
    return (
      `Preserved-EF (LVEF ${ef}%): focus on volume control, blood-pressure optimisation, comorbidity treatment ` +
      '(AF rate control, diabetes), and SGLT2 inhibitor (empagliflozin / dapagliflozin) which now has evidence in HFpEF.'
    );
  }
  return 'Establish LVEF as soon as feasible (echocardiography) to direct GDMT — pillars are identical until phenotype is known.';
}
