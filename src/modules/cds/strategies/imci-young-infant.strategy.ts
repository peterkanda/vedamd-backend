import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO IMCI Young-Infant Chart (0 to < 2 months) — sick young infant
 * assessment focusing on Possible Serious Bacterial Infection (PSBI) /
 * neonatal sepsis classification.
 *
 * Classification ladder:
 *
 *   1. Possible Serious Bacterial Infection / Very severe disease
 *      ANY of:
 *        • Not feeding well
 *        • Convulsing now OR history of convulsions in this illness
 *        • Severe chest indrawing
 *        • Fast breathing (respiratoryRatePerMin ≥ 60) on TWO counts
 *          (if recheckRrConfirmed === false, classify as fast breathing
 *           only — see below)
 *        • Movement only when stimulated, OR no movement at all
 *        • Fever ≥ 37.5 °C OR low body temperature < 35.5 °C
 *        • Severe jaundice (palms / soles)
 *        • Bulging fontanelle
 *      → CRITICAL. Pre-referral first dose IM ampicillin (50 mg/kg) +
 *        gentamicin (5 mg/kg infants < 7 days, 7.5 mg/kg ≥ 7 days)
 *        and urgent referral. Treat hypoglycaemia and hypothermia
 *        before transport.
 *
 *   2. Local bacterial infection (mild)
 *      Umbilicus red or draining pus (not extending to skin), OR
 *      ≤ 10 skin pustules with no severe signs.
 *      → WARNING. Treat with topical care + oral amoxicillin 5 days;
 *        follow up in 2 days.
 *
 *   3. Not very severe disease — no infection signs
 *      → INFO. Counsel home care, breastfeeding, when to return.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageDays                  number (0..59 inclusive)
 *   context.notFeedingWell           boolean
 *   context.convulsingNow            boolean
 *   context.convulsionsThisIllness   boolean
 *   context.severeChestIndrawing     boolean
 *   context.respiratoryRatePerMin    number
 *   context.recheckRrConfirmed       boolean (true means ≥ 60 confirmed
 *                                    on a second count per IMCI rule)
 *   context.movementOnlyWhenStimulated boolean
 *   context.noMovement               boolean
 *   context.bodyTempC                number
 *   context.severeJaundice           boolean
 *   context.bulgingFontanelle        boolean
 *   context.umbilicusInfectedNotSkin boolean
 *   context.skinPustulesFew          boolean
 *   context.weightKg                 number (optional, for the
 *                                    pre-referral antibiotic dose)
 */

const YOUNG_INFANT_AGE_DAYS_MAX = 59;
const FAST_BREATHING_THRESHOLD = 60;
const FEVER_C = 37.5;
const LOW_TEMP_C = 35.5;

interface YoungInfantContext {
  ageDays?: number;
  notFeedingWell?: boolean;
  convulsingNow?: boolean;
  convulsionsThisIllness?: boolean;
  severeChestIndrawing?: boolean;
  respiratoryRatePerMin?: number;
  recheckRrConfirmed?: boolean;
  movementOnlyWhenStimulated?: boolean;
  noMovement?: boolean;
  bodyTempC?: number;
  severeJaundice?: boolean;
  bulgingFontanelle?: boolean;
  umbilicusInfectedNotSkin?: boolean;
  skinPustulesFew?: boolean;
  weightKg?: number;
}

@Injectable()
export class ImciYoungInfantStrategy implements CdsRuleStrategy {
  readonly type = 'imci-young-infant';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as YoungInfantContext;
    if (typeof ctx.ageDays !== 'number' || ctx.ageDays < 0) return [];
    if (ctx.ageDays > YOUNG_INFANT_AGE_DAYS_MAX) return []; // 0..59 days

    const severeReasons: string[] = [];
    if (ctx.notFeedingWell === true) severeReasons.push('not feeding well');
    if (ctx.convulsingNow === true) severeReasons.push('convulsing now');
    if (ctx.convulsionsThisIllness === true) severeReasons.push('convulsions during this illness');
    if (ctx.severeChestIndrawing === true) severeReasons.push('severe chest indrawing');
    const fastBreathing =
      typeof ctx.respiratoryRatePerMin === 'number' &&
      ctx.respiratoryRatePerMin >= FAST_BREATHING_THRESHOLD;
    if (fastBreathing && ctx.recheckRrConfirmed === true) {
      severeReasons.push(`fast breathing ≥ ${FAST_BREATHING_THRESHOLD}/min confirmed on recheck`);
    }
    if (ctx.movementOnlyWhenStimulated === true) {
      severeReasons.push('moves only when stimulated');
    }
    if (ctx.noMovement === true) severeReasons.push('no movement');
    if (typeof ctx.bodyTempC === 'number' && ctx.bodyTempC >= FEVER_C) {
      severeReasons.push(`temperature ${ctx.bodyTempC.toFixed(1)} °C (fever)`);
    }
    if (typeof ctx.bodyTempC === 'number' && ctx.bodyTempC < LOW_TEMP_C) {
      severeReasons.push(`temperature ${ctx.bodyTempC.toFixed(1)} °C (hypothermia < ${LOW_TEMP_C})`);
    }
    if (ctx.severeJaundice === true) severeReasons.push('severe jaundice (palms / soles)');
    if (ctx.bulgingFontanelle === true) severeReasons.push('bulging fontanelle');

    if (severeReasons.length > 0) {
      const wkg = typeof ctx.weightKg === 'number' && ctx.weightKg > 0 ? ctx.weightKg : null;
      const ampMg = wkg ? Math.round(50 * wkg) : null;
      const gentMgPerKg = ctx.ageDays < 7 ? 5 : 7.5;
      const gentMg = wkg ? Math.round(gentMgPerKg * wkg) : null;
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Possible serious bacterial infection / very severe disease — refer urgently',
          'Severe feature(s): {{reasons}}. Per WHO IMCI Young-Infant Chart: give the first pre-referral dose of IM ampicillin ' +
            '({{ampDose}}) AND IM gentamicin ({{gentDose}}). Treat hypoglycaemia (give expressed breast milk or 10 % dextrose ' +
            '5 mL/kg by NG / IV), warm the infant skin-to-skin, and refer urgently to the nearest neonatal-care facility. ' +
            'Continue antibiotics every 6 h (ampicillin) and 24 h (gentamicin) during transfer where feasible.',
          {
            reasons: severeReasons.join('; '),
            ampDose: ampMg !== null ? `${ampMg} mg (50 mg/kg × ${wkg} kg)` : 'weight-banded ampicillin 50 mg/kg',
            gentDose:
              gentMg !== null
                ? `${gentMg} mg (${gentMgPerKg} mg/kg × ${wkg} kg)`
                : `weight-banded gentamicin ${gentMgPerKg} mg/kg`,
          },
        ),
      ];
    }

    // Local bacterial infection tier.
    if (ctx.umbilicusInfectedNotSkin === true || ctx.skinPustulesFew === true) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Local bacterial infection — topical care + oral antibiotic',
          'Localised infection signs present (umbilical redness / drainage or ≤ 10 skin pustules) without severe features. ' +
            'Teach the mother daily umbilical care with chlorhexidine 7.1 % digluconate solution. Give oral amoxicillin ' +
            '(50 mg/kg/day divided twice daily) for 5 days. Counsel return-immediately signs and follow up in 2 days.',
          {},
        ),
      ];
    }

    // Fast breathing without confirmation — clinician should recount.
    if (
      typeof ctx.respiratoryRatePerMin === 'number' &&
      ctx.respiratoryRatePerMin >= FAST_BREATHING_THRESHOLD &&
      ctx.recheckRrConfirmed !== true
    ) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Fast breathing ≥ 60/min — recount before classification',
          'A single respiratory-rate count ≥ 60/min in a young infant must be confirmed by recounting after settling. Recount ' +
            'over a full minute when the infant is calm; if still ≥ 60/min, classify as Possible Serious Bacterial Infection ' +
            '/ very severe disease and follow the urgent-referral pathway.',
          {},
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'No signs of serious infection — counsel home care',
        'No severe or local-infection signs identified. Counsel exclusive breastfeeding on demand, keep the infant warm ' +
          '(skin-to-skin), keep the umbilicus clean and dry, recognise return-immediately signs (poor feeding, fast / ' +
          'difficult breathing, fever or feels cold, fewer wet nappies). Follow up at the next scheduled child-welfare ' +
          'visit.',
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
      label: 'WHO IMCI Chartbook 2014 — Young Infant',
      url: 'https://apps.who.int/iris/handle/10665/104772',
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
