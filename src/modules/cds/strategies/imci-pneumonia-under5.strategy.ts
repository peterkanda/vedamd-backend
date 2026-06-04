import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO IMCI Chartbook — cough or difficult breathing in children under five.
 *
 * Classification ladder:
 *
 *   1. Severe pneumonia / very severe disease
 *      ANY of: general danger sign, stridor in a calm child, chest
 *      indrawing, oxygen saturation < 90%.
 *      → CRITICAL, urgent referral with first-dose IM/IV antibiotic.
 *
 *   2. Pneumonia
 *      Fast breathing without severe signs:
 *        • respiratoryRatePerMin ≥ 50 in infants 2–11 months
 *        • respiratoryRatePerMin ≥ 40 in children 12–59 months
 *      → WARNING. Treat with oral amoxicillin 40 mg/kg twice daily for
 *        5 days; follow up in 3 days.
 *
 *   3. No pneumonia (cough or cold)
 *      Neither severe signs nor fast breathing.
 *      → INFO. Soothe the throat, no antibiotic, return-immediately
 *        counselling.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageMonths              number (<60 required)
 *   context.daysOfCough            number ≥ 0 (optional; documentation)
 *   context.respiratoryRatePerMin  number > 0
 *   context.chestIndrawing         boolean
 *   context.stridorInCalmChild     boolean
 *   context.generalDangerSign      boolean
 *   context.oxygenSatPercent       number 0..100 (optional)
 */

const UNDER_FIVE_MONTHS = 60;
const FB_THRESHOLD_INFANT = 50; // 2–11 months
const FB_THRESHOLD_TODDLER = 40; // 12–59 months
const SPO2_SEVERE_THRESHOLD = 90;

interface PneumoniaContext {
  ageMonths?: number;
  daysOfCough?: number;
  respiratoryRatePerMin?: number;
  chestIndrawing?: boolean;
  stridorInCalmChild?: boolean;
  generalDangerSign?: boolean;
  oxygenSatPercent?: number;
}

@Injectable()
export class ImciPneumoniaUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-pneumonia-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PneumoniaContext;
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 2) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];

    const rr =
      typeof ctx.respiratoryRatePerMin === 'number' ? ctx.respiratoryRatePerMin : undefined;
    const spo2 =
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent <= 100
        ? ctx.oxygenSatPercent
        : undefined;
    const indrawing = ctx.chestIndrawing === true;
    const stridor = ctx.stridorInCalmChild === true;
    const danger = ctx.generalDangerSign === true;

    const severeReasons: string[] = [];
    if (danger) severeReasons.push('general danger sign');
    if (stridor) severeReasons.push('stridor in a calm child');
    if (indrawing) severeReasons.push('chest indrawing');
    if (spo2 !== undefined && spo2 < SPO2_SEVERE_THRESHOLD) {
      severeReasons.push(`SpO₂ ${spo2}% (<90%)`);
    }

    const fbThreshold = ctx.ageMonths < 12 ? FB_THRESHOLD_INFANT : FB_THRESHOLD_TODDLER;
    const fastBreathing = rr !== undefined && rr >= fbThreshold;

    let indicator: CdsIndicator;
    let summary: string;
    let detail: string;
    let vars: Record<string, string | number | boolean | null | undefined> = {
      ageMonths: ctx.ageMonths,
      rr: rr ?? 'not measured',
      spo2: spo2 ?? 'not measured',
      fbThreshold,
    };

    if (severeReasons.length > 0) {
      indicator = 'critical';
      summary = 'Severe pneumonia or very severe disease — urgent referral';
      detail =
        'Severe-classification feature(s): {{reasons}}. RR {{rr}}/min, SpO₂ {{spo2}}. Give the ' +
        'first dose of an injectable antibiotic (IM/IV ampicillin 50 mg/kg + gentamicin 7.5 mg/kg, ' +
        'or IM/IV ceftriaxone 50 mg/kg if available), give oxygen if SpO₂ < 90%, and refer urgently. ' +
        'Manage airway and shock if present.';
      vars = { ...vars, reasons: severeReasons.join(', ') };
    } else if (fastBreathing) {
      indicator = 'warning';
      summary = 'Pneumonia — oral amoxicillin and 3-day follow-up';
      detail =
        'Fast breathing without severe signs: RR {{rr}}/min ≥ {{fbThreshold}} for age {{ageMonths}} ' +
        'months. Treat with oral amoxicillin dispersible tablet 40 mg/kg twice daily for 5 days. ' +
        'Counsel on home care and return-immediately signs (difficult breathing, unable to drink, ' +
        'becomes sicker). Follow up in 3 days.';
    } else {
      indicator = 'info';
      summary = 'No pneumonia — cough or cold';
      detail =
        'No fast breathing (RR {{rr}}/min, threshold {{fbThreshold}}/min for age) and no severe ' +
        'signs. Treat as a cough or cold: soothe the throat with safe home remedies, no antibiotic. ' +
        'Counsel on return-immediately signs and follow up in 5 days if not improving.';
    }

    const ref = rule.references[0] ?? {
      label: 'WHO IMCI Chartbook 2014',
      url: 'https://apps.who.int/iris/handle/10665/104772',
    };
    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      vars,
    );
    return [
      {
        summary: outSummary,
        indicator,
        detail: outDetail.replace(/\s+/g, ' ').trim(),
        source: { label: ref.label, url: ref.url, strength: ref.strength },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      },
    ];
  }
}
