import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO IMCI Chartbook + Kenya National Malaria Treatment Guidelines —
 * malaria in children under five.
 *
 * Two-stage classification:
 *
 *   A. Severe malaria (any of)
 *        • any IMCI general danger sign
 *        • severeAnaemiaSign === true (palmar pallor, Hb < 5 g/dL,
 *          haematocrit < 15 %)
 *        • impairedConsciousness === true
 *        • prostration === true
 *        • convulsionsThisIllness === true
 *        • respiratoryDistress === true
 *      → CRITICAL. Give pre-referral artesunate 3 mg/kg IM/IV (or
 *        artesunate rectal 10 mg/kg in <6 y if IV unavailable) and
 *        refer urgently. Treat hypoglycaemia and convulsions.
 *
 *   B. Uncomplicated malaria (when rdtPositive === true and none of
 *      the severe signs are present)
 *      → WARNING. First-line: artemether-lumefantrine (AL) weight-
 *        banded, 6-dose regimen over 3 days, with food.
 *
 *   C. RDT negative + still febrile after IMCI fever assessment
 *      → INFO. Look for alternative cause; do NOT presumptively treat
 *        for malaria.
 *
 * Strategy fires only when malariaContextProvided is true (i.e. the
 * integrator has done the RDT or signs assessment for this visit).
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageMonths               number (<60 required)
 *   context.rdtPositive             boolean
 *   context.malariaContextProvided  boolean (sentinel — strategy
 *                                   stays silent without this)
 *   context.dangerSigns             string[] — IMCI general danger
 *                                   sign codes
 *   context.severeAnaemiaSign       boolean
 *   context.impairedConsciousness   boolean
 *   context.prostration             boolean
 *   context.convulsionsThisIllness  boolean
 *   context.respiratoryDistress     boolean
 *   context.weightKg                number (optional — pre-referral
 *                                   dose calculator if supplied)
 */

const UNDER_FIVE_MONTHS = 60;

const GENERAL_DANGER_SIGNS = new Set([
  'unable-to-drink-or-breastfeed',
  'vomits-everything',
  'history-of-convulsions',
  'lethargic-or-unconscious',
  'convulsing-now',
]);

interface MalariaContext {
  ageMonths?: number;
  rdtPositive?: boolean;
  malariaContextProvided?: boolean;
  dangerSigns?: string[];
  severeAnaemiaSign?: boolean;
  impairedConsciousness?: boolean;
  prostration?: boolean;
  convulsionsThisIllness?: boolean;
  respiratoryDistress?: boolean;
  weightKg?: number;
}

@Injectable()
export class ImciMalariaUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-malaria-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as MalariaContext;
    if (ctx.malariaContextProvided !== true) return [];
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];

    const severeReasons: string[] = [];
    const validDanger = Array.isArray(ctx.dangerSigns)
      ? ctx.dangerSigns.filter(
          (s): s is string => typeof s === 'string' && GENERAL_DANGER_SIGNS.has(s),
        )
      : [];
    if (validDanger.length > 0) severeReasons.push(`IMCI danger sign(s): ${validDanger.join(', ')}`);
    if (ctx.severeAnaemiaSign === true) severeReasons.push('severe anaemia sign');
    if (ctx.impairedConsciousness === true) severeReasons.push('impaired consciousness');
    if (ctx.prostration === true) severeReasons.push('prostration');
    if (ctx.convulsionsThisIllness === true) severeReasons.push('convulsions during this illness');
    if (ctx.respiratoryDistress === true) severeReasons.push('respiratory distress');

    if (severeReasons.length > 0) {
      const wkg = typeof ctx.weightKg === 'number' && ctx.weightKg > 0 ? ctx.weightKg : null;
      const preReferralMg = wkg ? Math.round(wkg * 3) : null;
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe malaria — give pre-referral artesunate and refer urgently',
          'Severe-feature(s) present: {{reasons}}. Per WHO IMCI Chartbook and Kenya National Malaria Treatment Guidelines, ' +
            'severe malaria is a paediatric emergency. Give parenteral artesunate {{doseMg}} ({{doseRule}}) — if IV/IM not available, use ' +
            'rectal artesunate 10 mg/kg as a single dose while transferring. Treat hypoglycaemia (give 5 mL/kg of 10 % dextrose), ' +
            'control convulsions, and refer urgently. Do NOT delay parenteral antimalarial for confirmatory tests.',
          {
            reasons: severeReasons.join('; '),
            doseMg: preReferralMg !== null ? `${preReferralMg} mg IM/IV` : 'weight-banded',
            doseRule:
              preReferralMg !== null
                ? `3 mg/kg × ${wkg} kg`
                : '3 mg/kg artesunate; supply weight to compute the absolute dose',
          },
        ),
      ];
    }

    if (ctx.rdtPositive === true) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Uncomplicated malaria — start AL and counsel',
          'RDT positive with no severe features. Start artemether-lumefantrine (AL) weight-banded 6-dose course over ' +
            '3 days WITH FOOD (a fat-containing snack improves lumefantrine absorption). Treat fever symptomatically with ' +
            'paracetamol 15 mg/kg. Counsel return-immediately signs (any IMCI danger sign, inability to drink, repeated ' +
            'vomiting, convulsions, lethargy). Follow up in 3 days; reassess if not improving.',
          {},
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'RDT negative — look for alternative cause of fever',
        'Malaria RDT negative and no severe features. Do NOT give empirical antimalarial. Complete the IMCI fever ' +
          'assessment to classify pneumonia, ear infection, urinary tract infection, viral illness, or other cause. ' +
          'If clinical suspicion of malaria remains strong despite the negative RDT, repeat the test in 12–24 h or ' +
          'send a thick / thin blood smear.',
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
