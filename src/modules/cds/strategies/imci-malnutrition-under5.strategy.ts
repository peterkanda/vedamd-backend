import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO IMCI + Kenya MoH IMAM — acute malnutrition in children under five.
 *
 * Classification ladder (age 6–59 months):
 *
 *   1. Complicated SAM
 *      MUAC < 11.5 cm OR bilateral pitting oedema OR weight-for-height
 *      Z-score (WHZ) < -3, AND any IMCI danger sign or refusal to feed
 *      or vomiting everything or recent convulsions
 *      → CRITICAL. Stabilise and admit to inpatient therapeutic care
 *        (F-75 → F-100 transition per WHO protocol).
 *
 *   2. Uncomplicated SAM
 *      MUAC < 11.5 cm OR bilateral pitting oedema OR WHZ < -3, with no
 *      complications and appetite test passed
 *      → WARNING. Enrol in outpatient therapeutic programme (OTP) with
 *        ready-to-use therapeutic food (RUTF) per Kenya IMAM protocol.
 *
 *   3. MAM (moderate acute malnutrition)
 *      MUAC 11.5–12.4 cm OR WHZ < -2 but ≥ -3, no oedema, no
 *      complications
 *      → WARNING. Enrol in supplementary feeding programme (SFP) and
 *        counsel on nutrition.
 *
 *   4. No acute malnutrition
 *      MUAC ≥ 12.5 cm AND no oedema AND (WHZ ≥ -2 if supplied)
 *      → INFO. Continue routine growth monitoring.
 *
 * Children < 6 months get a parallel infant-MUAC + weight-for-length
 * pathway noted in the card detail (out of scope for v0.1 calculator).
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageMonths           number (0–59)
 *   context.muacMm              number (millimetres — clinical
 *                               instruments commonly report mm; the
 *                               strategy converts to cm internally)
 *   context.bilateralPittingOedema  boolean
 *   context.weightForHeightZ    number (optional, -5..5 reasonable
 *                               range)
 *   context.appetiteTestPass    boolean (default false)
 *   context.dangerSigns         string[] — IMCI general danger signs
 *   context.refusesToFeed       boolean
 *   context.vomitsEverything    boolean
 */

const UNDER_FIVE_MONTHS = 60;
const SAM_MUAC_MM = 115;
const MAM_MUAC_MM_MAX = 124; // < 12.5 cm means MAM (inclusive boundary handled below)

const GENERAL_DANGER_SIGNS = new Set([
  'unable-to-drink-or-breastfeed',
  'vomits-everything',
  'history-of-convulsions',
  'lethargic-or-unconscious',
  'convulsing-now',
]);

interface MalnutritionContext {
  ageMonths?: number;
  muacMm?: number;
  bilateralPittingOedema?: boolean;
  weightForHeightZ?: number;
  appetiteTestPass?: boolean;
  dangerSigns?: string[];
  refusesToFeed?: boolean;
  vomitsEverything?: boolean;
}

@Injectable()
export class ImciMalnutritionUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-malnutrition-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as MalnutritionContext;
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];

    // For < 6 months the MUAC tables differ — surface a brief info card and
    // do not run the 6-59 calculator.
    if (ctx.ageMonths < 6) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Infant <6 months — use the infant nutrition pathway',
          'MUAC-based classification (≥ 11.5 cm) and the appetite test apply from 6 months. For infants under 6 months use ' +
            'the WHO infant feeding assessment and weight-for-length Z-score per the Kenya MoH IMAM guideline.',
          {},
        ),
      ];
    }

    const muacMm = typeof ctx.muacMm === 'number' && ctx.muacMm > 0 ? ctx.muacMm : null;
    const whz =
      typeof ctx.weightForHeightZ === 'number' && isFinite(ctx.weightForHeightZ)
        ? ctx.weightForHeightZ
        : null;
    const oedema = ctx.bilateralPittingOedema === true;

    if (muacMm === null && !oedema && whz === null) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'No anthropometric data — measure MUAC and check for oedema',
          'Supply at minimum a MUAC measurement in millimetres and check for bilateral pitting oedema on both feet. ' +
            'Where available, add weight-for-height Z-score for WHO-standard classification.',
          {},
        ),
      ];
    }

    const samByMuac = muacMm !== null && muacMm < SAM_MUAC_MM;
    const samByWhz = whz !== null && whz < -3;
    const sam = samByMuac || samByWhz || oedema;

    const mamByMuac = muacMm !== null && muacMm >= SAM_MUAC_MM && muacMm < MAM_MUAC_MM_MAX + 1;
    const mamByWhz = whz !== null && whz < -2 && whz >= -3;
    const mam = !sam && (mamByMuac || mamByWhz);

    const validDanger = Array.isArray(ctx.dangerSigns)
      ? ctx.dangerSigns.filter(
          (s): s is string => typeof s === 'string' && GENERAL_DANGER_SIGNS.has(s),
        )
      : [];
    const complications: string[] = [];
    if (validDanger.length > 0)
      complications.push(`IMCI danger sign(s): ${validDanger.join(', ')}`);
    if (ctx.refusesToFeed === true) complications.push('refuses to feed');
    if (ctx.vomitsEverything === true) complications.push('vomits everything');
    const appetiteFailed = ctx.appetiteTestPass === false;
    if (appetiteFailed) complications.push('failed appetite test');

    const features: string[] = [];
    if (samByMuac && muacMm !== null) features.push(`MUAC ${(muacMm / 10).toFixed(1)} cm`);
    else if (mamByMuac && muacMm !== null) features.push(`MUAC ${(muacMm / 10).toFixed(1)} cm`);
    else if (muacMm !== null) features.push(`MUAC ${(muacMm / 10).toFixed(1)} cm`);
    if (oedema) features.push('bilateral pitting oedema');
    if (whz !== null) features.push(`WHZ ${whz.toFixed(1)}`);

    if (sam && complications.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Complicated SAM — admit for inpatient therapeutic care',
          'Severe acute malnutrition with complication(s): {{complications}}. Findings: {{features}}. Per WHO + Kenya MoH IMAM, ' +
            'admit to inpatient therapeutic care: stabilise with F-75 every 2–3 h, treat hypoglycaemia (10 % dextrose 5 mL/kg), ' +
            'hypothermia, dehydration with ReSoMal (NOT standard ORS), and broad-spectrum antibiotics (ampicillin + gentamicin). ' +
            'Transition to F-100 once oedema reduces and appetite returns; discharge to OTP when MUAC > 11.5 cm and oedema free.',
          { complications: complications.join('; '), features: features.join('; ') },
        ),
      ];
    }

    if (sam) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Uncomplicated SAM — enrol in outpatient therapeutic programme (OTP)',
          'Severe acute malnutrition without complications. Findings: {{features}}. Per Kenya MoH IMAM, enrol in OTP with ' +
            'ready-to-use therapeutic food (RUTF) 200 kcal/kg/day, amoxicillin per IMAM protocol, vitamin A on day 1, ' +
            'and weekly review until exit criteria are met (MUAC > 12.5 cm, oedema free for 2 consecutive visits, 15 % weight gain).',
          { features: features.join('; ') },
        ),
      ];
    }

    if (mam) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Moderate acute malnutrition — enrol in supplementary feeding programme (SFP)',
          'Findings: {{features}}. Per Kenya MoH IMAM, enrol in SFP with fortified blended food / RUSF, nutrition counselling, ' +
            'deworming if ≥ 12 months and not dewormed in last 6 months, vitamin A supplementation per schedule. Review at ' +
            'two-weekly intervals; refer to OTP if MUAC drops below 11.5 cm or oedema develops.',
          { features: features.join('; ') },
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'No acute malnutrition — continue routine growth monitoring',
        'Findings: {{features}}. Continue routine growth monitoring at each well-child visit; counsel age-appropriate feeding, ' +
          'vitamin A and deworming per the Kenya routine schedule.',
        { features: features.join('; ') || 'no anthropometry-positive features' },
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
