import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Hypothyroidism — levothyroxine initiation (ATA 2014; pregnancy
 * guidance). Treat overt hypothyroidism (TSH > 10) and selectively
 * treat subclinical disease (TSH 4–10) when symptomatic, pregnant or
 * planning fertility. Dose by weight, with a low-and-slow start in the
 * elderly or those with ischaemic heart disease.
 *
 * Anonymous-by-design. Reads only:
 *   context.tsh number (mU/L)
 *   context.freeT4 number (pmol/L; low supports overt disease)
 *   context.ageYears number
 *   context.weightKg number (1.6 µg/kg/day full replacement)
 *   context.pregnant boolean
 *   context.fertilityPlanning boolean
 *   context.symptomatic boolean
 *   context.ihd boolean (ischaemic heart disease → start low)
 */

interface ThyroidContext {
  tsh?: number;
  freeT4?: number;
  ageYears?: number;
  weightKg?: number;
  pregnant?: boolean;
  fertilityPlanning?: boolean;
  symptomatic?: boolean;
  ihd?: boolean;
}

@Injectable()
export class HypothyroidismInitStrategy implements CdsRuleStrategy {
  readonly type = 'hypothyroidism-init';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ThyroidContext;
    if (typeof ctx.tsh !== 'number') return [];

    const tsh = ctx.tsh;
    const overt = tsh > 10;
    const subclinicalTreat =
      tsh >= 4 &&
      tsh <= 10 &&
      (ctx.symptomatic === true || ctx.pregnant === true || ctx.fertilityPlanning === true);

    if (!overt && !subclinicalTreat) {
      return [
        this.card(
          rule,
          req,
          'info',
          'Thyroid — levothyroxine not routinely indicated; monitor',
          `TSH ${tsh} mU/L does not meet treatment thresholds (overt: TSH > 10; subclinical TSH 4–10 only treated if symptomatic, ` +
            'pregnant or planning fertility). Confirm with a repeat TSH + free T4 in 3–6 months, check anti-TPO antibodies, and exclude ' +
            'non-thyroidal illness / assay interference before deciding.',
        ),
      ];
    }

    const elderlyOrIhd =
      (typeof ctx.ageYears === 'number' && ctx.ageYears >= 65) || ctx.ihd === true;
    let indicator: CdsIndicator = 'info';
    let summary: string;
    let recommendation: string;

    if (ctx.pregnant === true) {
      indicator = 'warning';
      summary = 'Hypothyroidism in pregnancy — start/optimise levothyroxine, tight TSH target';
      const startDose =
        typeof ctx.weightKg === 'number'
          ? `~${Math.round(ctx.weightKg * 2)} µg/day (≈2 µg/kg)`
          : '~2 µg/kg/day';
      recommendation =
        `Pregnancy → treat promptly and aim TSH < 2.5 mU/L. If newly diagnosed, start levothyroxine ${startDose}. If already on ` +
        'levothyroxine and pregnancy is confirmed, INCREASE the dose by ~30% immediately (e.g. two extra tablets per week). Recheck TSH ' +
        'every 4 weeks through the first half of pregnancy and titrate. Involve obstetrics/endocrinology.';
    } else if (elderlyOrIhd) {
      indicator = 'warning';
      summary = 'Hypothyroidism — start LOW-dose levothyroxine (elderly / IHD)';
      recommendation =
        'Elderly or ischaemic heart disease → start levothyroxine LOW: 25 µg once daily and up-titrate by 25 µg every 4–6 weeks ' +
        'guided by TSH and angina/arrhythmia tolerance (rapid full replacement can precipitate ischaemia). Recheck TSH at 6–8 weeks ' +
        'after each change; target TSH within the reference range.';
    } else {
      indicator = 'info';
      summary = 'Hypothyroidism — start full-dose levothyroxine';
      const startDose =
        typeof ctx.weightKg === 'number'
          ? `${Math.round(ctx.weightKg * 1.6)} µg/day (1.6 µg/kg)`
          : '1.6 µg/kg/day';
      recommendation =
        `Young, no cardiac disease → start levothyroxine at near-full replacement ${startDose}, once daily on an empty stomach ` +
        '(separate from calcium/iron/PPIs). Recheck TSH at 6–8 weeks and titrate to the reference range. Counsel on lifelong adherence.';
    }

    return [this.card(rule, req, indicator, summary, recommendation)];
  }

  private card(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    summary: string,
    detail: string,
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'ATA Guidelines for the Treatment of Hypothyroidism (2014)',
      url: 'https://www.thyroid.org/professionals/ata-professional-guidelines/',
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
