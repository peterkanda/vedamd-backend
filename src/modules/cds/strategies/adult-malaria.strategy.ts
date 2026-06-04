import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Adult malaria — WHO Guidelines for Malaria (2023) + Kenya NMTG.
 *
 * Two-stage classification (mirrors the under-5 strategy):
 *
 *   A. Severe malaria (any of)
 *      impaired consciousness, prostration, multiple convulsions,
 *      respiratory distress / acidosis, abnormal bleeding, jaundice
 *      with another vital-organ dysfunction, shock, hyperparasitaemia
 *      reported, hypoglycaemia (< 2.2 mmol/L), severe anaemia
 *      (Hb < 7 g/dL), AKI (creatinine ≥ 265 µmol/L or rapidly rising),
 *      black-water urine, pulmonary oedema.
 *      → CRITICAL. Parenteral artesunate 2.4 mg/kg IV/IM at 0 / 12 /
 *        24 h then daily (auto-computed when context.weightKg is
 *        supplied) + supportive care (correct hypoglycaemia, manage
 *        seizures, careful fluids per FEAST principles in adults
 *        where appropriate). Transition to a full 3-day oral AL once
 *        tolerating orals.
 *
 *   B. Uncomplicated malaria (RDT-positive, no severe features)
 *      → WARNING. Artemether-lumefantrine (AL) 4 tablets twice daily
 *        for 3 days WITH FOOD. Adult dosing 40 kg+. Counsel return-
 *        immediately signs and follow up at 3 days.
 *
 *   C. RDT negative
 *      → INFO. Look for alternative cause; do NOT presumptively treat.
 *
 *   Special-population guidance overlays inside the relevant tier:
 *      pregnant (no primaquine; quinine restricted to 1st trimester
 *      where artesunate unavailable; standard ACTs from 2nd trimester);
 *      HIV-positive (drug-drug interactions with NNRTIs / efavirenz);
 *      G6PD deficiency (primaquine contraindicated).
 *
 * Strategy fires when context.malariaContextProvided is true. Reads:
 *
 *   context.ageYears                  number ≥ 12 (adult or adolescent)
 *   context.weightKg                  number (optional, for IV dose)
 *   context.malariaContextProvided    boolean (sentinel)
 *   context.rdtPositive               boolean
 *   context.impairedConsciousness     boolean
 *   context.prostration               boolean
 *   context.multipleConvulsions       boolean
 *   context.respiratoryDistress       boolean
 *   context.abnormalBleeding          boolean
 *   context.jaundiceWithOrganDysfn    boolean
 *   context.shock                     boolean
 *   context.hyperparasitaemia         boolean
 *   context.bloodGlucoseMmolL         number
 *   context.haemoglobinGdl            number
 *   context.creatinineUmolL           number
 *   context.blackwaterUrine           boolean
 *   context.pulmonaryOedema           boolean
 *   context.pregnant                  boolean
 *   context.pregnancyTrimester        1 | 2 | 3 | null
 *   context.knownHivPositive          boolean
 *   context.knownG6pdDeficient        boolean
 */

const ADULT_MIN_AGE_YEARS = 12;
const SEVERE_HB = 7;
const SEVERE_CREATININE = 265;
const HYPOGLYCAEMIA_MMOLL = 2.2;

interface AdultMalariaContext {
  ageYears?: number;
  weightKg?: number;
  malariaContextProvided?: boolean;
  rdtPositive?: boolean;
  impairedConsciousness?: boolean;
  prostration?: boolean;
  multipleConvulsions?: boolean;
  respiratoryDistress?: boolean;
  abnormalBleeding?: boolean;
  jaundiceWithOrganDysfn?: boolean;
  shock?: boolean;
  hyperparasitaemia?: boolean;
  bloodGlucoseMmolL?: number;
  haemoglobinGdl?: number;
  creatinineUmolL?: number;
  blackwaterUrine?: boolean;
  pulmonaryOedema?: boolean;
  pregnant?: boolean;
  pregnancyTrimester?: 1 | 2 | 3 | null;
  knownHivPositive?: boolean;
  knownG6pdDeficient?: boolean;
}

@Injectable()
export class AdultMalariaStrategy implements CdsRuleStrategy {
  readonly type = 'adult-malaria';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AdultMalariaContext;
    if (ctx.malariaContextProvided !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_MIN_AGE_YEARS) return [];

    const severeReasons: string[] = [];
    if (ctx.impairedConsciousness === true) severeReasons.push('impaired consciousness');
    if (ctx.prostration === true) severeReasons.push('prostration');
    if (ctx.multipleConvulsions === true) severeReasons.push('multiple convulsions');
    if (ctx.respiratoryDistress === true) severeReasons.push('respiratory distress');
    if (ctx.abnormalBleeding === true) severeReasons.push('abnormal bleeding');
    if (ctx.jaundiceWithOrganDysfn === true) {
      severeReasons.push('jaundice with another organ dysfunction');
    }
    if (ctx.shock === true) severeReasons.push('shock');
    if (ctx.hyperparasitaemia === true) severeReasons.push('hyperparasitaemia reported');
    if (
      typeof ctx.bloodGlucoseMmolL === 'number' &&
      ctx.bloodGlucoseMmolL < HYPOGLYCAEMIA_MMOLL
    ) {
      severeReasons.push(`hypoglycaemia (${ctx.bloodGlucoseMmolL.toFixed(1)} mmol/L)`);
    }
    if (typeof ctx.haemoglobinGdl === 'number' && ctx.haemoglobinGdl < SEVERE_HB) {
      severeReasons.push(`severe anaemia (Hb ${ctx.haemoglobinGdl.toFixed(1)} g/dL)`);
    }
    if (typeof ctx.creatinineUmolL === 'number' && ctx.creatinineUmolL >= SEVERE_CREATININE) {
      severeReasons.push(`acute kidney injury (creatinine ${Math.round(ctx.creatinineUmolL)} µmol/L)`);
    }
    if (ctx.blackwaterUrine === true) severeReasons.push('black-water urine');
    if (ctx.pulmonaryOedema === true) severeReasons.push('pulmonary oedema');

    if (severeReasons.length > 0) {
      const wkg = typeof ctx.weightKg === 'number' && ctx.weightKg > 0 ? ctx.weightKg : null;
      const artesMg = wkg ? Math.round(2.4 * wkg) : null;
      const overlay = buildPopulationOverlay(ctx, 'severe');
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe adult malaria — IV artesunate + supportive care',
          'Severe feature(s): {{reasons}}. Per WHO Guidelines for Malaria 2023 and Kenya NMTG: give parenteral artesunate ' +
            '{{dose}} IV/IM at 0, 12 and 24 hours then once daily. Treat hypoglycaemia (5 mL/kg 10 % dextrose), manage seizures ' +
            '(IV diazepam 0.15 mg/kg), correct severe anaemia with packed-cell transfusion if Hb < 7 g/dL with respiratory ' +
            'distress, and consult intensivist for AKI / shock / pulmonary oedema. Transition to a full 3-day oral artemether-' +
            'lumefantrine course once tolerating orally and clinically improved. {{overlay}}',
          {
            reasons: severeReasons.join('; '),
            dose: artesMg !== null ? `${artesMg} mg (2.4 mg/kg × ${wkg} kg)` : '2.4 mg/kg artesunate (weight-banded)',
            overlay,
          },
        ),
      ];
    }

    if (ctx.rdtPositive === true) {
      const overlay = buildPopulationOverlay(ctx, 'uncomplicated');
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Uncomplicated adult malaria — start AL with food',
          'RDT positive, no severe features. Adult artemether-lumefantrine: 4 tablets twice daily for 3 days WITH FOOD (a ' +
            'fat-containing snack improves lumefantrine absorption). Add paracetamol 1 g every 6 h for fever. Counsel return-' +
            'immediately signs (drowsiness, convulsions, dark urine, repeated vomiting, breathlessness, jaundice). Follow up at ' +
            'day 3 and day 28. {{overlay}}',
          { overlay },
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'RDT negative — look for alternative cause of fever',
        'Malaria RDT negative and no severe features. Do NOT give empirical antimalarial. Continue the adult febrile-illness ' +
          'workup (urinalysis, blood cultures, malaria film, HIV / TB consideration in endemic settings). If clinical ' +
          'suspicion of malaria remains strong despite the negative RDT, repeat in 12–24 h or send a thick / thin blood smear.',
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
      label: 'WHO Guidelines for Malaria (2023)',
      url: 'https://www.who.int/publications/i/item/guidelines-for-malaria',
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

function buildPopulationOverlay(
  ctx: AdultMalariaContext,
  tier: 'uncomplicated' | 'severe',
): string {
  const lines: string[] = [];
  if (ctx.pregnant === true) {
    if (ctx.pregnancyTrimester === 1) {
      lines.push(
        tier === 'severe'
          ? 'Pregnancy 1st trimester: IV artesunate is recommended over quinine for severe malaria (WHO 2022 update).'
          : 'Pregnancy 1st trimester: artemether-lumefantrine is acceptable per WHO 2022 update when quinine is unavailable or not tolerated; document risk-benefit discussion.',
      );
    } else {
      lines.push('Pregnancy 2nd/3rd trimester: standard artemether-lumefantrine course is recommended.');
    }
    lines.push('Primaquine is contraindicated in pregnancy.');
  }
  if (ctx.knownHivPositive === true) {
    lines.push(
      'HIV co-infection: avoid co-administration of nevirapine / efavirenz–based ART with AL where possible (reduced lumefantrine levels); continue co-trimoxazole prophylaxis if eligible.',
    );
  }
  if (ctx.knownG6pdDeficient === true) {
    lines.push(
      'G6PD deficiency: primaquine and tafenoquine are contraindicated. Use AL or artesunate only.',
    );
  }
  return lines.join(' ');
}
