import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Sepsis recognition (Sepsis-3 + WHO 1-hour bundle).
 *
 *   qSOFA (1 point each):
 *     • Altered mentation (GCS < 15 or new confusion)
 *     • Respiratory rate ≥ 22/min
 *     • Systolic BP ≤ 100 mmHg
 *
 *   Bands:
 *     qSOFA ≥ 2 + suspected infection      → CRITICAL: WHO 1-hour bundle.
 *     qSOFA 1 with suspected infection,
 *       OR features of organ dysfunction
 *       (SpO₂ < 92, urine output low,
 *        lactate ≥ 2 mmol/L, mottled skin) → WARNING: high-dependency
 *                                            observation, repeat in 1 h.
 *     qSOFA 0 with suspected infection     → INFO: source-control
 *                                            counselling + safety-net.
 *
 * Septic-shock escalation: hypotension despite fluids (≥ 30 mL/kg
 * crystalloid) OR lactate > 4 mmol/L → emit an additional CRITICAL
 * card for vasopressor initiation.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 18
 *   context.suspectedInfection        boolean (sentinel)
 *   context.alteredMentation          boolean
 *   context.respiratoryRatePerMin     number
 *   context.systolicMmHg              number
 *   context.heartRatePerMin           number (optional, SIRS context)
 *   context.bodyTempC                 number (optional, SIRS context)
 *   context.oxygenSatPercent          number (optional)
 *   context.lactateMmolL              number (optional)
 *   context.urineOutputMlPerKgPerHr   number (optional)
 *   context.fluidsGivenMlPerKg        number (optional)
 */

const ADULT_AGE_YEARS = 18;
const RR_THRESHOLD = 22;
const SBP_THRESHOLD = 100;
const SHOCK_LACTATE = 4;
const SEPSIS_LACTATE = 2;
const FLUIDS_ADEQUATE_MLPERKG = 30;
const SPO2_ORGAN_DYSFN = 92;
const LOW_URINE_OUTPUT = 0.5;

interface SepsisContext {
  ageYears?: number;
  suspectedInfection?: boolean;
  alteredMentation?: boolean;
  respiratoryRatePerMin?: number;
  systolicMmHg?: number;
  heartRatePerMin?: number;
  bodyTempC?: number;
  oxygenSatPercent?: number;
  lactateMmolL?: number;
  urineOutputMlPerKgPerHr?: number;
  fluidsGivenMlPerKg?: number;
}

@Injectable()
export class SepsisQSofaStrategy implements CdsRuleStrategy {
  readonly type = 'sepsis-qsofa';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SepsisContext;
    if (ctx.suspectedInfection !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    let qsofa = 0;
    const components: string[] = [];
    if (ctx.alteredMentation === true) {
      qsofa += 1;
      components.push('altered mentation');
    }
    if (
      typeof ctx.respiratoryRatePerMin === 'number' &&
      ctx.respiratoryRatePerMin >= RR_THRESHOLD
    ) {
      qsofa += 1;
      components.push(`RR ${ctx.respiratoryRatePerMin}/min (≥ ${RR_THRESHOLD})`);
    }
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg <= SBP_THRESHOLD) {
      qsofa += 1;
      components.push(`SBP ${ctx.systolicMmHg} mmHg (≤ ${SBP_THRESHOLD})`);
    }

    const lowSpo2 =
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < SPO2_ORGAN_DYSFN;
    const highLactate =
      typeof ctx.lactateMmolL === 'number' && ctx.lactateMmolL >= SEPSIS_LACTATE;
    const shockLactate =
      typeof ctx.lactateMmolL === 'number' && ctx.lactateMmolL > SHOCK_LACTATE;
    const lowUrine =
      typeof ctx.urineOutputMlPerKgPerHr === 'number' &&
      ctx.urineOutputMlPerKgPerHr < LOW_URINE_OUTPUT;
    const adequateFluids =
      typeof ctx.fluidsGivenMlPerKg === 'number' &&
      ctx.fluidsGivenMlPerKg >= FLUIDS_ADEQUATE_MLPERKG;
    const persistentHypotension =
      adequateFluids && typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < 90;

    const cards: CdsCard[] = [];

    if (qsofa >= 2) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          `Sepsis suspected — qSOFA ${qsofa} of 3. Activate the WHO 1-hour bundle.`,
          'qSOFA components: {{components}}. Per the WHO sepsis-management consensus and Surviving Sepsis Campaign 1-hour ' +
            'bundle: measure lactate; obtain blood cultures BEFORE the first antibiotic dose (but do not delay antibiotics); ' +
            'give a broad-spectrum antibiotic within 1 hour (ceftriaxone 2 g IV; add metronidazole 500 mg IV for intra-abdominal ' +
            'or pelvic sources); begin 30 mL/kg crystalloid bolus if hypotension or lactate ≥ 4; insert urinary catheter to ' +
            'measure hourly urine output; transfer to high-dependency / ICU for vasopressor (noradrenaline) titration if ' +
            'mean arterial pressure < 65 mmHg after fluid loading.',
          { components: components.join('; ') },
        ),
      );
    } else if (qsofa === 1 || lowSpo2 || highLactate || lowUrine) {
      const extras: string[] = [];
      if (lowSpo2) extras.push(`SpO₂ ${ctx.oxygenSatPercent}%`);
      if (highLactate) extras.push(`lactate ${ctx.lactateMmolL!.toFixed(1)} mmol/L`);
      if (lowUrine)
        extras.push(`urine output ${ctx.urineOutputMlPerKgPerHr!.toFixed(2)} mL/kg/h (< 0.5)`);
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          `Possible sepsis — qSOFA ${qsofa}; obtain workup and reassess within 1 hour`,
          'Components / dysfunction features: {{features}}. Obtain a full septic screen (FBC, U&E, CRP, blood cultures, urinalysis, ' +
            'chest X-ray, lactate). Start antibiotics within 1 hour if clinical suspicion remains. Place in a high-observation area ' +
            'with q15-min vitals, and re-assess qSOFA at 60 minutes — escalate to the full sepsis bundle if it climbs to ≥ 2.',
          { features: [components.join('; '), ...extras].filter(Boolean).join('; ') },
        ),
      );
    } else {
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          'Infection without qSOFA features — source-control + safety-net',
          'No qSOFA features and no organ-dysfunction signs identified at this moment. Treat the suspected source per local ' +
            'protocol, counsel the patient on return-immediately signs (new confusion, breathlessness, dizziness on standing, ' +
            'reduced urine, mottled skin), and arrange follow-up at 24–48 h.',
          {},
        ),
      );
    }

    if (shockLactate || persistentHypotension) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Septic shock — start vasopressors and ICU transfer',
          `Shock criteria met (${shockLactate ? `lactate ${ctx.lactateMmolL!.toFixed(1)} mmol/L` : ''}` +
            `${shockLactate && persistentHypotension ? ' and ' : ''}` +
            `${persistentHypotension ? `SBP ${ctx.systolicMmHg} mmHg after ${ctx.fluidsGivenMlPerKg!.toFixed(0)} mL/kg fluids` : ''}). ` +
            'Start a noradrenaline infusion at 0.05–0.5 µg/kg/min titrated to MAP ≥ 65 mmHg; continue antibiotics and source ' +
            'control; arrange urgent ICU transfer. Re-assess fluid responsiveness by passive leg raise — further fluid only if ' +
            'a clear response, otherwise stop and rely on vasopressors.',
          {},
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
      label: 'Surviving Sepsis Campaign — 1-hour bundle',
      url: 'https://www.sccm.org/SurvivingSepsisCampaign',
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
