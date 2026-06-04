import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO PEN HEARTS — suspected new hypertension at chart open.
 *
 * Plain-language rule:
 *
 *   IF the patient is an adult (≥18 years)
 *   AND does not already carry an active hypertension diagnosis
 *   AND has at least two BP readings in the last 90 days
 *       with systolic ≥140 mmHg OR diastolic ≥90 mmHg
 *   THEN fire a `warning` card recommending confirmatory BP measurements
 *        and lifestyle counselling before initiating pharmacotherapy.
 *
 * Anonymous-by-design — reads only:
 *
 *   context.ageYears                 number (≥18 means adult)
 *   context.hasActiveHypertensionDx  boolean (default false)
 *   context.recentBPmmHg             Array<{ systolicMmHg, diastolicMmHg, daysAgo }>
 *
 * No name, no DOB, no MRN, no medical-record ID ever crosses the API
 * boundary. The integrator extracts the BP series from their own EMR
 * and passes only the numeric readings here.
 */

const ADULT_AGE_YEARS = 18;
const SBP_THRESHOLD = 140;
const DBP_THRESHOLD = 90;
const LOOKBACK_DAYS = 90;
const MIN_ELEVATED_READINGS = 2;

interface BpReading {
  systolicMmHg: number;
  diastolicMmHg: number;
  daysAgo: number;
}

interface HtnContext {
  ageYears?: number;
  hasActiveHypertensionDx?: boolean;
  recentBPmmHg?: BpReading[];
}

function isValidReading(r: unknown): r is BpReading {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.systolicMmHg === 'number' &&
    isFinite(x.systolicMmHg) &&
    typeof x.diastolicMmHg === 'number' &&
    isFinite(x.diastolicMmHg) &&
    typeof x.daysAgo === 'number' &&
    isFinite(x.daysAgo) &&
    x.daysAgo >= 0
  );
}

@Injectable()
export class PenHypertensionScreenStrategy implements CdsRuleStrategy {
  readonly type = 'pen-hypertension-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HtnContext;

    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];
    if (ctx.hasActiveHypertensionDx === true) return [];

    const readings = Array.isArray(ctx.recentBPmmHg) ? ctx.recentBPmmHg.filter(isValidReading) : [];
    const inWindow = readings.filter((r) => r.daysAgo <= LOOKBACK_DAYS);
    const elevated = inWindow.filter(
      (r) => r.systolicMmHg >= SBP_THRESHOLD || r.diastolicMmHg >= DBP_THRESHOLD,
    );

    if (elevated.length < MIN_ELEVATED_READINGS) return [];

    const maxSys = Math.max(...elevated.map((r) => r.systolicMmHg));
    const maxDia = Math.max(...elevated.map((r) => r.diastolicMmHg));

    const defaultSummary = 'Suspected new hypertension — confirm before initiating pharmacotherapy';
    const defaultDetail =
      '{{elevatedCount}} BP readings in the last {{lookbackDays}} days met the elevated threshold (≥140 systolic or ≥90 diastolic); ' +
      'highest values: {{maxSys}}/{{maxDia}} mmHg. ' +
      'Per WHO PEN HEARTS and Kenya Clinical Guidelines 2018, confirm with ≥2 office-based readings on separate visits ' +
      '(or 24-hour ambulatory / home BP monitoring) before diagnosing hypertension. Begin lifestyle counselling now; ' +
      'initiate pharmacotherapy per the PEN-HEARTS stepwise algorithm only once the diagnosis is confirmed.';

    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      {
        elevatedCount: elevated.length,
        lookbackDays: LOOKBACK_DAYS,
        maxSys,
        maxDia,
      },
    );

    const ref = rule.references[0] ?? {
      label: 'WHO PEN — HEARTS technical package',
      url: 'https://www.who.int/publications/i/item/9789241514613',
    };

    return [
      {
        summary,
        indicator: 'warning',
        detail,
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
