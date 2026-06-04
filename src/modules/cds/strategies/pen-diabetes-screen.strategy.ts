import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO PEN — suspected new diabetes at chart open.
 *
 * Plain-language rule:
 *
 *   IF the patient is an adult (≥18 years)
 *   AND does not already carry an active diabetes diagnosis
 *   AND any of the following diagnostic-threshold readings exists in
 *       the last 180 days:
 *         • fasting plasma glucose ≥ 7.0 mmol/L
 *         • random / non-fasting plasma glucose ≥ 11.1 mmol/L
 *         • HbA1c ≥ 6.5 %
 *   THEN fire a `warning` card recommending a confirmatory test on a
 *        separate day per WHO PEN.
 *
 * Anonymous-by-design — reads only:
 *
 *   context.ageYears                  number (≥18 means adult)
 *   context.hasActiveDiabetesDx       boolean (default false)
 *   context.recentGlucoseMmolL        Array<{ value, fasting, daysAgo }>
 *   context.recentHbA1cPercent        Array<{ value, daysAgo }>
 *
 * No name, no DOB, no MRN. The integrator extracts only the numeric
 * lab values from their EMR.
 */

const ADULT_AGE_YEARS = 18;
const FASTING_GLUCOSE_MMOLL = 7.0;
const RANDOM_GLUCOSE_MMOLL = 11.1;
const HBA1C_PERCENT = 6.5;
const LOOKBACK_DAYS = 180;

interface GlucoseReading {
  valueMmolL: number;
  fasting: boolean;
  daysAgo: number;
}
interface HbA1cReading {
  value: number;
  daysAgo: number;
}

interface DmContext {
  ageYears?: number;
  hasActiveDiabetesDx?: boolean;
  recentGlucoseMmolL?: GlucoseReading[];
  recentHbA1cPercent?: HbA1cReading[];
}

function isValidGlucose(r: unknown): r is GlucoseReading {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.valueMmolL === 'number' &&
    isFinite(x.valueMmolL) &&
    typeof x.fasting === 'boolean' &&
    typeof x.daysAgo === 'number' &&
    isFinite(x.daysAgo) &&
    x.daysAgo >= 0
  );
}
function isValidHbA1c(r: unknown): r is HbA1cReading {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.value === 'number' &&
    isFinite(x.value) &&
    typeof x.daysAgo === 'number' &&
    isFinite(x.daysAgo) &&
    x.daysAgo >= 0
  );
}

@Injectable()
export class PenDiabetesScreenStrategy implements CdsRuleStrategy {
  readonly type = 'pen-diabetes-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as DmContext;

    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];
    if (ctx.hasActiveDiabetesDx === true) return [];

    const glucoses = (Array.isArray(ctx.recentGlucoseMmolL) ? ctx.recentGlucoseMmolL : []).filter(
      isValidGlucose,
    );
    const hba1cs = (Array.isArray(ctx.recentHbA1cPercent) ? ctx.recentHbA1cPercent : []).filter(
      isValidHbA1c,
    );

    const triggers: string[] = [];

    const fastingHigh = glucoses.filter(
      (g) => g.fasting && g.daysAgo <= LOOKBACK_DAYS && g.valueMmolL >= FASTING_GLUCOSE_MMOLL,
    );
    if (fastingHigh.length > 0) {
      const max = Math.max(...fastingHigh.map((g) => g.valueMmolL));
      triggers.push(
        `fasting plasma glucose ${max.toFixed(1)} mmol/L (threshold ≥${FASTING_GLUCOSE_MMOLL.toFixed(1)})`,
      );
    }

    const randomHigh = glucoses.filter(
      (g) => !g.fasting && g.daysAgo <= LOOKBACK_DAYS && g.valueMmolL >= RANDOM_GLUCOSE_MMOLL,
    );
    if (randomHigh.length > 0) {
      const max = Math.max(...randomHigh.map((g) => g.valueMmolL));
      triggers.push(
        `random plasma glucose ${max.toFixed(1)} mmol/L (threshold ≥${RANDOM_GLUCOSE_MMOLL.toFixed(1)})`,
      );
    }

    const hba1cHigh = hba1cs.filter((h) => h.daysAgo <= LOOKBACK_DAYS && h.value >= HBA1C_PERCENT);
    if (hba1cHigh.length > 0) {
      const max = Math.max(...hba1cHigh.map((h) => h.value));
      triggers.push(`HbA1c ${max.toFixed(1)} % (threshold ≥${HBA1C_PERCENT.toFixed(1)} %)`);
    }

    if (triggers.length === 0) return [];

    const defaultSummary =
      'Suspected new diabetes — confirm on a separate day before initiating therapy';
    const defaultDetail =
      'Diagnostic-threshold result(s) detected: {{triggers}}. ' +
      'Per WHO PEN (2020) and Kenya Clinical Guidelines 2018, confirm with a repeat measurement on a separate day before initiating ' +
      'glucose-lowering therapy unless the patient is symptomatic with unequivocal hyperglycaemia. Begin lifestyle counselling now; ' +
      'classify type and start the PEN diabetes management algorithm once the diagnosis is confirmed.';

    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      { triggers: triggers.join('; ') },
    );

    const ref = rule.references[0] ?? {
      label: 'WHO PEN — Package of essential NCD interventions (2020)',
      url: 'https://www.who.int/publications/i/item/who-package-of-essential-noncommunicable-(pen)-disease-interventions-for-primary-health-care',
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
