import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Severe asthma exacerbation (GINA 2024 + WHO PEN).
 *
 * Tier ladder (worst feature wins):
 *
 *   CRITICAL — LIFE-THREATENING asthma (any of):
 *     silent chest on auscultation, exhaustion / altered conscious-
 *     ness, cyanosis, SpO₂ < 90 % on room air, PEF < 33 % personal
 *     best / predicted, hypotension (SBP < 90), arrhythmia, poor
 *     respiratory effort.
 *     → Immediate IM adrenaline 0.5 mg (only if anaphylactoid features
 *       or arrest imminent), continuous nebulised salbutamol +
 *       ipratropium, IV magnesium sulphate 2 g over 20 min, IV
 *       hydrocortisone 200 mg, oxygen target SpO₂ 94–98 %, prepare
 *       for advanced airway, call ICU.
 *
 *   CRITICAL — SEVERE acute asthma (any of):
 *     inability to complete sentences in one breath, RR ≥ 30, HR ≥ 120,
 *     PEF 33–50 % personal best / predicted, SpO₂ 90–94 %.
 *     → Salbutamol 4–10 puffs via spacer every 20 min OR nebulised
 *       5 mg every 20 min × 3 in the first hour, add nebulised
 *       ipratropium 500 µg every 4–6 h, oral prednisolone 40–50 mg
 *       (or IV hydrocortisone 200 mg if vomiting), oxygen target
 *       SpO₂ 94–98 %, reassess at 1 hour — escalate if no improvement.
 *
 *   WARNING — MODERATE acute asthma:
 *     symptoms present without severe / life-threatening features,
 *     PEF > 50 % personal best / predicted.
 *     → Salbutamol 2–4 puffs every 20 min via spacer × 3, oral
 *       prednisolone 40–50 mg daily for 5 days, written action plan
 *       review, follow up in 24–48 hours.
 *
 *   INFO — no exacerbation features:
 *     reinforce inhaler technique, controller adherence, written
 *     action plan, vaccination status.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 5
 *   context.knownAsthma               boolean (sentinel)
 *   context.respiratoryRatePerMin     number (optional)
 *   context.heartRatePerMin           number (optional)
 *   context.oxygenSatPercent          number (optional)
 *   context.peakFlowPercentBest       number 0..200 (optional)
 *   context.silentChest               boolean
 *   context.exhaustionOrAltered       boolean
 *   context.cyanosis                  boolean
 *   context.systolicMmHg              number (optional)
 *   context.unableToCompleteSentence  boolean
 */

const MIN_AGE_YEARS = 5;
const LIFE_THREATENING_SPO2 = 90;
const LIFE_THREATENING_PEF = 33;
const SEVERE_PEF = 50;
const SEVERE_RR = 30;
const SEVERE_HR = 120;
const SEVERE_SPO2 = 95;
const SHOCK_SBP = 90;

interface AsthmaContext {
  ageYears?: number;
  knownAsthma?: boolean;
  respiratoryRatePerMin?: number;
  heartRatePerMin?: number;
  oxygenSatPercent?: number;
  peakFlowPercentBest?: number;
  silentChest?: boolean;
  exhaustionOrAltered?: boolean;
  cyanosis?: boolean;
  systolicMmHg?: number;
  unableToCompleteSentence?: boolean;
}

@Injectable()
export class SevereAsthmaExacerbationStrategy implements CdsRuleStrategy {
  readonly type = 'severe-asthma-exacerbation';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AsthmaContext;
    if (ctx.knownAsthma !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < MIN_AGE_YEARS) return [];

    const lifeThreateningReasons: string[] = [];
    if (ctx.silentChest === true) lifeThreateningReasons.push('silent chest');
    if (ctx.exhaustionOrAltered === true) {
      lifeThreateningReasons.push('exhaustion / altered consciousness');
    }
    if (ctx.cyanosis === true) lifeThreateningReasons.push('cyanosis');
    if (
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < LIFE_THREATENING_SPO2
    ) {
      lifeThreateningReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< ${LIFE_THREATENING_SPO2})`);
    }
    if (
      typeof ctx.peakFlowPercentBest === 'number' &&
      ctx.peakFlowPercentBest < LIFE_THREATENING_PEF
    ) {
      lifeThreateningReasons.push(
        `PEF ${ctx.peakFlowPercentBest}% personal best / predicted (< ${LIFE_THREATENING_PEF})`,
      );
    }
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SHOCK_SBP) {
      lifeThreateningReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< ${SHOCK_SBP})`);
    }

    if (lifeThreateningReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'LIFE-THREATENING asthma — call ICU and start emergency bundle',
          'Life-threatening feature(s): {{reasons}}. Bundle: continuous nebulised salbutamol 5 mg + ipratropium 500 µg every ' +
            '4–6 h driven by oxygen at 8 L/min (target SpO₂ 94–98 %); IV magnesium sulphate 2 g over 20 min; IV hydrocortisone ' +
            '200 mg; consider IV salbutamol 250 µg over 10 min in deteriorating patients; arterial blood gas; prepare for ' +
            'advanced airway / intubation; refer ICU urgently. If arrest imminent or anaphylactoid pattern, give IM adrenaline ' +
            '0.5 mg.',
          { reasons: lifeThreateningReasons.join('; ') },
        ),
      ];
    }

    const severeReasons: string[] = [];
    if (ctx.unableToCompleteSentence === true) {
      severeReasons.push('cannot complete sentences in one breath');
    }
    if (
      typeof ctx.respiratoryRatePerMin === 'number' &&
      ctx.respiratoryRatePerMin >= SEVERE_RR
    ) {
      severeReasons.push(`RR ${ctx.respiratoryRatePerMin}/min (≥ ${SEVERE_RR})`);
    }
    if (typeof ctx.heartRatePerMin === 'number' && ctx.heartRatePerMin >= SEVERE_HR) {
      severeReasons.push(`HR ${ctx.heartRatePerMin}/min (≥ ${SEVERE_HR})`);
    }
    if (
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < SEVERE_SPO2
    ) {
      severeReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< ${SEVERE_SPO2})`);
    }
    if (
      typeof ctx.peakFlowPercentBest === 'number' &&
      ctx.peakFlowPercentBest >= LIFE_THREATENING_PEF &&
      ctx.peakFlowPercentBest < SEVERE_PEF
    ) {
      severeReasons.push(`PEF ${ctx.peakFlowPercentBest}% (33–50)`);
    }

    if (severeReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe acute asthma — bronchodilators + systemic steroids + observation',
          'Severe feature(s): {{reasons}}. Salbutamol 4–10 puffs via spacer (or nebulised 5 mg) every 20 min during the ' +
            'first hour, driven by oxygen titrated to SpO₂ 94–98 %. Add nebulised ipratropium 500 µg every 4–6 hours. Oral ' +
            'prednisolone 40–50 mg single dose (IV hydrocortisone 200 mg if vomiting). Reassess at 1 hour — if no improvement, ' +
            'escalate to the life-threatening bundle (IV magnesium sulphate 2 g over 20 min, ICU consultation).',
          { reasons: severeReasons.join('; ') },
        ),
      ];
    }

    const moderate =
      typeof ctx.peakFlowPercentBest === 'number'
        ? ctx.peakFlowPercentBest >= SEVERE_PEF && ctx.peakFlowPercentBest < 80
        : true;

    if (moderate) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Moderate asthma exacerbation — bronchodilator + 5-day oral steroid',
          'PEF > 50 % personal best, no severe / life-threatening features. Salbutamol 2–4 puffs via spacer every 20 minutes ' +
            '× 3, then reassess. Oral prednisolone 40–50 mg daily for 5 days (paediatric: 1–2 mg/kg/day, max 40 mg, ' +
            '3–5 days). Review inhaler technique, controller adherence and the written asthma action plan. Follow up in ' +
            '24–48 hours; counsel return-immediately signs.',
          {},
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Asthma well controlled at this contact — reinforce action plan',
        'No exacerbation features. Review controller therapy (low / medium-dose ICS-formoterol or ICS + LABA per GINA), ' +
          'recheck inhaler technique, update written action plan, and ensure influenza / pneumococcal vaccination is current.',
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
      label: 'GINA — Global Strategy for Asthma Management (2024)',
      url: 'https://ginasthma.org/',
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
