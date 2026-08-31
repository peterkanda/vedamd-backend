import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Iron-deficiency anaemia — replacement pathway (BSH 2021). Confirms
 * iron deficiency from ferritin/transferrin saturation, estimates the
 * iron deficit (Ganzoni), and routes between alternate-day oral ferrous
 * sulphate (hepcidin-optimised) and IV iron for defined indications.
 *
 * Anonymous-by-design. Reads only:
 *   context.hb number (g/L; values < 25 auto-interpreted as g/dL)
 *   context.ferritin number (µg/L; < 30 confirms deficiency, < 15 definite)
 *   context.tsat number (%; < 20 supports deficiency)
 *   context.weightKg number (Ganzoni deficit)
 *   context.pregnant boolean | context.gestationWeeks number
 *   context.malabsorption | context.ckdAnaemia | context.ibd | context.oralIntolerant booleans (IV iron triggers)
 */

const TARGET_HB_GL = 150;

interface AnaemiaContext {
  hb?: number;
  ferritin?: number;
  tsat?: number;
  weightKg?: number;
  pregnant?: boolean;
  gestationWeeks?: number;
  malabsorption?: boolean;
  ckdAnaemia?: boolean;
  ibd?: boolean;
  oralIntolerant?: boolean;
}

@Injectable()
export class AnaemiaIronReplacementStrategy implements CdsRuleStrategy {
  readonly type = 'anaemia-iron-replacement';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AnaemiaContext;
    if (typeof ctx.hb !== 'number') return [];

    const hb = ctx.hb < 25 ? ctx.hb * 10 : ctx.hb; // auto g/dL → g/L
    const lowFerritin = typeof ctx.ferritin === 'number' && ctx.ferritin < 30;
    const lowTsat = typeof ctx.tsat === 'number' && ctx.tsat < 20;
    const ironDeficient =
      lowFerritin || lowTsat || (typeof ctx.ferritin !== 'number' && typeof ctx.tsat !== 'number');

    if (!ironDeficient) {
      return [
        this.card(
          rule,
          req,
          'info',
          'Anaemia — iron studies do not confirm iron deficiency',
          `Hb ${hb} g/L with ferritin ${ctx.ferritin ?? '?'} µg/L / TSAT ${ctx.tsat ?? '?'}% does not confirm iron deficiency. ` +
            'Investigate other causes (anaemia of chronic disease, B12/folate, haemolysis, haemoglobinopathy, marrow). Note ferritin is ' +
            'an acute-phase reactant — interpret with CRP; consider TSAT/CHr if inflammation is present.',
        ),
      ];
    }

    const pregnantOk =
      ctx.pregnant === true && typeof ctx.gestationWeeks === 'number'
        ? ctx.gestationWeeks >= 14
        : ctx.pregnant === true;
    const severe = hb < 70;
    const ivTrigger =
      ctx.oralIntolerant === true ||
      ctx.malabsorption === true ||
      ctx.ckdAnaemia === true ||
      ctx.ibd === true ||
      (ctx.pregnant === true && pregnantOk) ||
      severe;

    let deficitText = '';
    if (typeof ctx.weightKg === 'number') {
      const deficit = Math.round(ctx.weightKg * (TARGET_HB_GL - hb) * 0.24 + 500);
      deficitText = `Estimated total iron deficit (Ganzoni) ≈ ${deficit} mg [weight ${ctx.weightKg} kg, target Hb 150 g/L]. `;
    }

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (ivTrigger) {
      indicator = severe ? 'warning' : 'info';
      summary = severe
        ? `Iron-deficiency anaemia — Hb ${hb} g/L (severe): IV iron ± transfusion`
        : 'Iron-deficiency anaemia — IV iron indicated';
      const reasons = [
        ctx.oralIntolerant && 'oral intolerance',
        ctx.malabsorption && 'malabsorption',
        ctx.ckdAnaemia && 'CKD anaemia',
        ctx.ibd && 'IBD',
        ctx.pregnant && pregnantOk && 'pregnancy ≥ 14 weeks',
        severe && 'severe symptomatic anaemia',
      ].filter(Boolean);
      recommendation =
        `IV iron indicated (${reasons.join(', ') || 'defined indication'}): ferric carboxymaltose dosed by weight/Hb deficit ` +
        `(per product label). ${deficitText}` +
        (severe
          ? 'For Hb < 70 g/L with symptoms/instability, consider red-cell transfusion alongside iron repletion. '
          : '') +
        'Identify and treat the source of iron loss (GI investigation in men and post-menopausal women). Recheck FBC at 2–4 weeks and ' +
        'ferritin at 8–12 weeks; aim to replete stores (ferritin > 100 µg/L).';
    } else {
      indicator = 'info';
      summary = 'Iron-deficiency anaemia — oral iron (alternate-day dosing)';
      recommendation =
        `Confirmed iron deficiency → first-line oral iron: ferrous sulphate 200 mg (≈65 mg elemental) ONCE on alternate days — ` +
        `alternate-day single dosing improves fractional absorption and tolerability (hepcidin evidence). ${deficitText}` +
        'Take on an empty stomach with vitamin C; warn about GI effects. Recheck Hb at 2–4 weeks (expect a rise of ~20 g/L by 4 weeks); ' +
        'continue ~3 months after Hb normalises to replete stores. Investigate and treat the cause of blood/iron loss.';
    }

    const context = `Hb ${hb} g/L${typeof ctx.ferritin === 'number' ? `, ferritin ${ctx.ferritin} µg/L` : ''}${typeof ctx.tsat === 'number' ? `, TSAT ${ctx.tsat}%` : ''}. `;
    return [this.card(rule, req, indicator, summary, context + recommendation)];
  }

  private card(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    summary: string,
    detail: string,
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'BSH Guideline for the laboratory diagnosis of iron deficiency (2021)',
      url: 'https://onlinelibrary.wiley.com/doi/10.1111/bjh.16221',
    };
    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, {
      summary,
      detail,
    });
    return {
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
    };
  }
}
