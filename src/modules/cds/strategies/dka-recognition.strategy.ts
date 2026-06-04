import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Diabetic ketoacidosis (DKA) — recognition + management bundle.
 *
 * Aligned to JBDS / ADA criteria + WHO PEN diabetes module:
 *
 *   Diagnostic triad:
 *     • Plasma glucose ≥ 11 mmol/L (or known diabetes)
 *     • Acidosis: venous / arterial pH < 7.30 OR HCO₃⁻ < 15 mmol/L
 *     • Ketonaemia / ketonuria: capillary blood ketones ≥ 3 mmol/L
 *       OR urine ketones ≥ 2+
 *
 *   Severity (any one):
 *     • pH < 7.0 OR HCO₃⁻ < 5
 *     • blood ketones > 6
 *     • GCS ≤ 12 / Kussmaul breathing with reduced mentation
 *     • SBP < 90 OR HR > 120 / shock
 *     • potassium < 3.5 mmol/L on initial sample
 *
 * Outputs:
 *   CRITICAL — diagnostic triad met → DKA bundle (IV NaCl 0.9 %
 *   1 L/h for 1–2 h then guided fluids; fixed-rate IV insulin
 *   0.1 U/kg/h with auto-computed mg dose when `weightKg`; replace
 *   potassium 40 mmol/L IV fluids when K 3.5–5.5; do NOT give insulin
 *   if K < 3.5 until corrected; treat precipitant). Adds a SECOND
 *   critical card with the severe-DKA flag when severity criteria met.
 *
 *   WARNING — partial criteria (hyperglycaemia + ketones OR
 *   hyperglycaemia + acidosis OR significant ketonaemia without
 *   confirmed hyperglycaemia): investigate / repeat / expedite to a
 *   facility with point-of-care testing.
 *
 *   INFO — hyperglycaemia alone with no acidosis or ketonaemia:
 *   re-check glucose, screen for precipitants.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears              number
 *   context.weightKg              number (optional)
 *   context.suspectedDka          boolean (sentinel; rule silent
 *                                 without it)
 *   context.plasmaGlucoseMmolL    number
 *   context.venousPh              number (optional)
 *   context.bicarbonateMmolL      number (optional)
 *   context.bloodKetonesMmolL     number (optional)
 *   context.urineKetones          '0'|'trace'|'+'|'++'|'+++' (optional)
 *   context.glasgowComaScale      number (optional)
 *   context.kussmaulBreathing     boolean (optional)
 *   context.systolicMmHg          number (optional)
 *   context.heartRatePerMin       number (optional)
 *   context.potassiumMmolL        number (optional)
 *   context.precipitantSuspected  'infection' | 'omission' | 'mi' |
 *                                 'new-onset' | 'pregnancy' | 'other' |
 *                                 null
 */

const HYPERGLYCAEMIA_MMOLL = 11;
const PH_DKA = 7.3;
const HCO3_DKA = 15;
const KETONES_BLOOD_DKA = 3;
const KETONES_BLOOD_SEVERE = 6;
const PH_SEVERE = 7.0;
const HCO3_SEVERE = 5;
const GCS_SEVERE = 12;
const SBP_SHOCK = 90;
const HR_SHOCK = 120;
const K_LOW = 3.5;
const INSULIN_U_PER_KG_PER_HR = 0.1;

interface DkaContext {
  ageYears?: number;
  weightKg?: number;
  suspectedDka?: boolean;
  plasmaGlucoseMmolL?: number;
  venousPh?: number;
  bicarbonateMmolL?: number;
  bloodKetonesMmolL?: number;
  urineKetones?: '0' | 'trace' | '+' | '++' | '+++';
  glasgowComaScale?: number;
  kussmaulBreathing?: boolean;
  systolicMmHg?: number;
  heartRatePerMin?: number;
  potassiumMmolL?: number;
  precipitantSuspected?: 'infection' | 'omission' | 'mi' | 'new-onset' | 'pregnancy' | 'other' | null;
}

@Injectable()
export class DkaRecognitionStrategy implements CdsRuleStrategy {
  readonly type = 'dka-recognition';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as DkaContext;
    if (ctx.suspectedDka !== true) return [];

    const hyperglycaemia =
      typeof ctx.plasmaGlucoseMmolL === 'number' && ctx.plasmaGlucoseMmolL >= HYPERGLYCAEMIA_MMOLL;
    const acidosis =
      (typeof ctx.venousPh === 'number' && ctx.venousPh < PH_DKA) ||
      (typeof ctx.bicarbonateMmolL === 'number' && ctx.bicarbonateMmolL < HCO3_DKA);
    const ketones =
      (typeof ctx.bloodKetonesMmolL === 'number' && ctx.bloodKetonesMmolL >= KETONES_BLOOD_DKA) ||
      ctx.urineKetones === '++' ||
      ctx.urineKetones === '+++';

    const triadMet = hyperglycaemia && acidosis && ketones;

    if (!triadMet) {
      const partialReasons: string[] = [];
      if (hyperglycaemia) partialReasons.push('hyperglycaemia');
      if (acidosis) partialReasons.push('acidosis');
      if (ketones) partialReasons.push('ketonaemia / ketonuria');

      if (partialReasons.length === 0) {
        return [
          this.buildCard(
            rule,
            req,
            'info',
            'No DKA features detected — confirm baseline diabetes care',
            'No hyperglycaemia, acidosis, or ketonaemia reported. If clinical suspicion is high, repeat capillary glucose and ' +
              'ketones; if low, document differential and counsel return-immediately signs (vomiting, breathlessness, ' +
              'confusion, severe thirst, abdominal pain).',
            {},
          ),
        ];
      }
      if (partialReasons.length >= 2) {
        return [
          this.buildCard(
            rule,
            req,
            'warning',
            'Partial DKA picture — expedite full workup',
            'Features present: {{features}}. Send venous blood gas + ketones + electrolytes + creatinine + glucose + FBC. ' +
              'If labs unavailable, transfer urgently — at least two of three diagnostic criteria are present and DKA must be ' +
              'excluded.',
            { features: partialReasons.join(', ') },
          ),
        ];
      }
      // Single criterion.
      return [
        this.buildCard(
          rule,
          req,
          partialReasons[0] === 'hyperglycaemia' ? 'info' : 'warning',
          partialReasons[0] === 'hyperglycaemia'
            ? 'Isolated hyperglycaemia — re-check + screen for precipitant'
            : 'Isolated metabolic abnormality — investigate alternative cause',
          'Single feature present ({{feature}}); diagnostic DKA triad not met. Repeat lab, exclude alternative causes ' +
            '(starvation ketosis, alcohol, sepsis without DKA).',
          { feature: partialReasons[0] },
        ),
      ];
    }

    // Triad met — output the bundle.
    const severeReasons: string[] = [];
    if (typeof ctx.venousPh === 'number' && ctx.venousPh < PH_SEVERE) {
      severeReasons.push(`pH ${ctx.venousPh.toFixed(2)} (< ${PH_SEVERE})`);
    }
    if (typeof ctx.bicarbonateMmolL === 'number' && ctx.bicarbonateMmolL < HCO3_SEVERE) {
      severeReasons.push(`HCO₃⁻ ${ctx.bicarbonateMmolL.toFixed(1)} mmol/L (< ${HCO3_SEVERE})`);
    }
    if (typeof ctx.bloodKetonesMmolL === 'number' && ctx.bloodKetonesMmolL > KETONES_BLOOD_SEVERE) {
      severeReasons.push(`blood ketones ${ctx.bloodKetonesMmolL.toFixed(1)} mmol/L (> ${KETONES_BLOOD_SEVERE})`);
    }
    if (typeof ctx.glasgowComaScale === 'number' && ctx.glasgowComaScale <= GCS_SEVERE) {
      severeReasons.push(`GCS ${ctx.glasgowComaScale}`);
    }
    if (ctx.kussmaulBreathing === true) severeReasons.push('Kussmaul breathing');
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SBP_SHOCK) {
      severeReasons.push(`SBP ${ctx.systolicMmHg} mmHg (shock)`);
    }
    if (typeof ctx.heartRatePerMin === 'number' && ctx.heartRatePerMin > HR_SHOCK) {
      severeReasons.push(`HR ${ctx.heartRatePerMin}/min (> ${HR_SHOCK})`);
    }
    if (typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL < K_LOW) {
      severeReasons.push(`potassium ${ctx.potassiumMmolL.toFixed(1)} mmol/L (hold insulin until corrected)`);
    }

    const wkg = typeof ctx.weightKg === 'number' && ctx.weightKg > 0 ? ctx.weightKg : null;
    const insulinPerHrU = wkg ? Number((wkg * INSULIN_U_PER_KG_PER_HR).toFixed(1)) : null;
    const insulinLine = insulinPerHrU !== null
      ? `Fixed-rate intravenous insulin infusion at ${insulinPerHrU} U/h (${INSULIN_U_PER_KG_PER_HR} U/kg/h × ${wkg} kg)`
      : `Fixed-rate intravenous insulin infusion at ${INSULIN_U_PER_KG_PER_HR} U/kg/h (supply context.weightKg to compute the absolute rate)`;

    const precipitantLine = ctx.precipitantSuspected
      ? ` Suspected precipitant: ${ctx.precipitantSuspected.replace('-', ' ')} — investigate and treat in parallel.`
      : ' Always search for a precipitant: infection (CXR, urinalysis, blood cultures), insulin omission, MI / silent ischaemia, new-onset T1DM, pregnancy.';

    const cards: CdsCard[] = [];
    cards.push(
      this.buildCard(
        rule,
        req,
        'critical',
        'Diabetic ketoacidosis confirmed — start the DKA bundle',
        'Diagnostic triad met: hyperglycaemia + acidosis + ketonaemia. Bundle: (1) IV crystalloid 0.9 % NaCl 1 L over 1 hour, ' +
          'then 1 L over 2 hours, then 1 L over 2 hours, 4 hours, 4 hours, 6 hours (adjust for cardiac / renal disease). ' +
          '(2) {{insulin}}. Add long-acting basal insulin early (continue any pre-admission basal). (3) Replace potassium ' +
          '40 mmol/L IV fluids when K 3.5–5.5; do NOT start insulin until K ≥ 3.5. (4) Switch to 10 % dextrose at 125 mL/h when ' +
          'glucose < 14 mmol/L (continue insulin until ketones < 0.6 and HCO₃⁻ > 18). (5) VTE prophylaxis (LMWH) and urinary ' +
          'catheter if oliguric.{{precipitant}}',
        { insulin: insulinLine, precipitant: precipitantLine },
      ),
    );

    if (severeReasons.length > 0) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe DKA — escalate to high-dependency / ICU',
          'Severe-feature(s): {{reasons}}. Transfer to a high-dependency / ICU setting for hourly metabolic monitoring, ' +
            'central-line consideration, continuous ECG (T-wave changes guide K replacement). Cerebral-oedema risk is highest ' +
            'in children — keep fluid resuscitation cautious (10 mL/kg bolus only with overt shock; correct deficit over ' +
            '48 hours; avoid rapid Na drop).',
          { reasons: severeReasons.join('; ') },
        ),
      );
    }

    return cards;
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
      label: 'JBDS Inpatient Care Group — DKA in adults',
      url: 'https://abcd.care/joint-british-diabetes-societies-jbds-inpatient-care-group',
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
        },
      },
    };
  }
}
