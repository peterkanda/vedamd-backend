import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO IMCI Chartbook — diarrhoea in children under five.
 *
 * Two parallel classifications fire from the same context:
 *
 *   A. Dehydration classification (Plan A / B / C)
 *
 *      Severe dehydration  — any TWO of {lethargic-or-unconscious,
 *        sunken-eyes, unable-to-drink-or-drinks-poorly,
 *        skin-pinch-very-slow}                       → CRITICAL, Plan C
 *      Some dehydration    — any TWO of {restless-or-irritable,
 *        sunken-eyes, drinks-eagerly-thirsty,
 *        skin-pinch-slow}                            → WARNING,  Plan B
 *      No dehydration      — none of the above       → INFO,     Plan A
 *
 *   B. Acute / persistent / dysentery overlay
 *
 *      daysOfDiarrhoea ≥ 14                          → WARNING (persistent)
 *      bloodInStool: true                            → WARNING (dysentery)
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageMonths              number (<60 required)
 *   context.daysOfDiarrhoea        number ≥ 0
 *   context.bloodInStool           boolean
 *   context.dehydrationSigns       string[] (codes below)
 *
 * Permitted dehydrationSigns codes (WHO IMCI 2014):
 *   lethargic-or-unconscious, sunken-eyes,
 *   unable-to-drink-or-drinks-poorly, restless-or-irritable,
 *   drinks-eagerly-thirsty, skin-pinch-very-slow, skin-pinch-slow
 */

const UNDER_FIVE_MONTHS = 60;
const PERSISTENT_DIARRHOEA_DAYS = 14;

const SEVERE_SIGNS = new Set([
  'lethargic-or-unconscious',
  'sunken-eyes',
  'unable-to-drink-or-drinks-poorly',
  'skin-pinch-very-slow',
]);
const SOME_SIGNS = new Set([
  'restless-or-irritable',
  'sunken-eyes',
  'drinks-eagerly-thirsty',
  'skin-pinch-slow',
]);
const VALID_SIGNS = new Set([...SEVERE_SIGNS, ...SOME_SIGNS]);

interface DiarrhoeaContext {
  ageMonths?: number;
  daysOfDiarrhoea?: number;
  bloodInStool?: boolean;
  dehydrationSigns?: string[];
}

@Injectable()
export class ImciDiarrhoeaUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-diarrhoea-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as DiarrhoeaContext;
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];
    if (typeof ctx.daysOfDiarrhoea !== 'number' || ctx.daysOfDiarrhoea < 0) return [];

    const signs = Array.isArray(ctx.dehydrationSigns)
      ? ctx.dehydrationSigns.filter((s): s is string => typeof s === 'string' && VALID_SIGNS.has(s))
      : [];
    const severeMatches = signs.filter((s) => SEVERE_SIGNS.has(s));
    const someMatches = signs.filter((s) => SOME_SIGNS.has(s));

    const cards: CdsCard[] = [];

    // A. Dehydration classification — exactly one card.
    let indicator: CdsIndicator;
    let summary: string;
    let detail: string;
    if (new Set(severeMatches).size >= 2) {
      indicator = 'critical';
      summary = 'Severe dehydration — IMCI Plan C, urgent referral';
      detail =
        'Reported signs: {{signs}}. Per WHO IMCI Plan C, start IV fluids immediately ' +
        "(Ringer's lactate or normal saline 100 mL/kg over 3–6 h depending on age) and refer " +
        'urgently to a facility able to manage shock. If unable to give IV, attempt NG ORS ' +
        '20 mL/kg/h while transferring. Reassess every 15–30 min.';
    } else if (new Set(someMatches).size >= 2) {
      indicator = 'warning';
      summary = 'Some dehydration — IMCI Plan B';
      detail =
        'Reported signs: {{signs}}. Per WHO IMCI Plan B, give ORS 75 mL/kg over 4 hours at the ' +
        'facility, supervise feeding, reassess at 4 h. Continue breastfeeding throughout. ' +
        'If the child develops any general danger sign during reassessment, escalate to Plan C.';
    } else {
      indicator = 'info';
      summary = 'No dehydration — IMCI Plan A (home management)';
      detail =
        'No dehydration signs reported. Per WHO IMCI Plan A: extra fluids at home (ORS 50–100 mL ' +
        '<2 y; 100–200 mL ≥2 y per loose stool), continue breastfeeding and age-appropriate ' +
        'feeding, give zinc 10–20 mg daily for 10–14 days, counsel on the four return-immediately ' +
        'signs (unable to drink, blood in stool, becomes sicker, fever onset). Follow up in 5 days ' +
        'if not improving.';
    }
    cards.push(
      this.buildCard(rule, req, indicator, summary, detail, {
        signs: signs.length > 0 ? signs.join(', ') : 'none reported',
      }),
    );

    // B. Persistent diarrhoea overlay.
    if (ctx.daysOfDiarrhoea >= PERSISTENT_DIARRHOEA_DAYS) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Persistent diarrhoea (≥14 days) — additional management',
          'Diarrhoea has lasted {{days}} days. Per WHO IMCI, classify as persistent diarrhoea: ' +
            'screen for HIV and persistent infection, continue zinc, modify feeding (lactose-reduced ' +
            'if needed, frequent small meals), and refer if accompanied by any dehydration.',
          { days: ctx.daysOfDiarrhoea },
        ),
      );
    }

    // C. Dysentery overlay.
    if (ctx.bloodInStool === true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Dysentery — blood in stool reported',
          'Blood in stool is a hallmark of dysentery (most commonly Shigella in this region). ' +
            'Per WHO IMCI, give a first-line oral antibiotic per local sensitivity (commonly ' +
            'ciprofloxacin 15 mg/kg twice daily for 3 days where Shigella is sensitive), continue ' +
            'ORS and feeding, and follow up at 2 days. Refer if no improvement or any danger sign.',
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
      label: 'WHO IMCI Chartbook 2014',
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
