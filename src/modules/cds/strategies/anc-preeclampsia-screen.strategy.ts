import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO ANC SMART Guideline + Kenya MoH ANC profile — pre-eclampsia /
 * gestational hypertension screen.
 *
 * Fires only for pregnant patients ≥ 20 weeks gestation. Ladder:
 *
 *   1. SEVERE pre-eclampsia / eclampsia features → CRITICAL
 *      any one of:
 *        • SBP ≥ 160 OR DBP ≥ 110 (severe-range BP)
 *        • urineProteinDipstick === '+++'
 *        • severe symptom reported: severe headache, blurred vision,
 *                                   epigastric pain, convulsions
 *      → urgent referral, magnesium sulphate per Kenya MoH protocol,
 *        delivery once stabilised.
 *
 *   2. Pre-eclampsia → WARNING
 *        SBP ≥ 140 OR DBP ≥ 90 (≥ 2 readings) AND
 *        urineProteinDipstick in ('+', '++')
 *      → admit or close follow-up, BP control, antenatal corticosteroids
 *        if < 34 wk and delivery considered.
 *
 *   3. Gestational hypertension → WARNING
 *        SBP ≥ 140 OR DBP ≥ 90 (≥ 2 readings) AND no proteinuria
 *      → weekly BP + proteinuria checks, lifestyle counselling.
 *
 *   4. Otherwise → no card (this screen is silent for normotensive
 *      asymptomatic pregnancies).
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.pregnant                  boolean (must be true)
 *   context.gestationalAgeWeeks       number (must be ≥ 20)
 *   context.recentBPmmHg              [{systolicMmHg, diastolicMmHg, daysAgo}]
 *   context.urineProteinDipstick      '0' | 'trace' | '+' | '++' | '+++' | null
 *   context.symptoms                  string[] — severe-symptom codes
 */

const MIN_GA_WEEKS = 20;
const LOOKBACK_DAYS = 14;
const SEVERE_SBP = 160;
const SEVERE_DBP = 110;
const HTN_SBP = 140;
const HTN_DBP = 90;
const MIN_ELEVATED_READINGS = 2;

const SEVERE_SYMPTOM_LABELS: Record<string, string> = {
  'severe-headache': 'severe persistent headache',
  'blurred-vision': 'blurred vision / scotomata',
  'epigastric-pain': 'epigastric / right-upper-quadrant pain',
  convulsions: 'convulsions',
};

interface BpReading {
  systolicMmHg: number;
  diastolicMmHg: number;
  daysAgo: number;
}

interface PreEclampsiaContext {
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  recentBPmmHg?: BpReading[];
  urineProteinDipstick?: '0' | 'trace' | '+' | '++' | '+++' | null;
  symptoms?: string[];
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
export class AncPreeclampsiaScreenStrategy implements CdsRuleStrategy {
  readonly type = 'anc-preeclampsia-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PreEclampsiaContext;
    if (ctx.pregnant !== true) return [];
    if (typeof ctx.gestationalAgeWeeks !== 'number' || ctx.gestationalAgeWeeks < MIN_GA_WEEKS) {
      return [];
    }

    const readings = Array.isArray(ctx.recentBPmmHg)
      ? ctx.recentBPmmHg.filter(isValidReading).filter((r) => r.daysAgo <= LOOKBACK_DAYS)
      : [];
    const elevated = readings.filter(
      (r) => r.systolicMmHg >= HTN_SBP || r.diastolicMmHg >= HTN_DBP,
    );
    const severeRange = readings.filter(
      (r) => r.systolicMmHg >= SEVERE_SBP || r.diastolicMmHg >= SEVERE_DBP,
    );

    const proteinuriaLevel = ctx.urineProteinDipstick ?? '0';
    const proteinuriaSignificant =
      proteinuriaLevel === '+' || proteinuriaLevel === '++' || proteinuriaLevel === '+++';
    const proteinuriaSevere = proteinuriaLevel === '+++';

    const reportedSymptoms = Array.isArray(ctx.symptoms)
      ? ctx.symptoms.filter((s): s is string => typeof s === 'string' && s in SEVERE_SYMPTOM_LABELS)
      : [];

    // 1. Severe features → CRITICAL.
    const severeReasons: string[] = [];
    if (severeRange.length > 0) {
      const max = severeRange[0];
      severeReasons.push(
        `severe-range BP (${max.systolicMmHg}/${max.diastolicMmHg} mmHg, threshold ≥${SEVERE_SBP}/${SEVERE_DBP})`,
      );
    }
    if (proteinuriaSevere) {
      severeReasons.push(`proteinuria ${proteinuriaLevel} on dipstick`);
    }
    if (reportedSymptoms.length > 0) {
      const labels = reportedSymptoms.map((s) => SEVERE_SYMPTOM_LABELS[s]).join(', ');
      severeReasons.push(`severe symptom(s): ${labels}`);
    }

    if (severeReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe pre-eclampsia / impending eclampsia — urgent referral',
          'Triggers: {{reasons}}. Per WHO ANC SMART Guideline + Kenya MoH ANC profile: give a ' +
            'loading dose of magnesium sulphate (4 g IV slow over 5–10 min + 10 g IM split), control ' +
            'BP with IV labetalol or oral nifedipine immediate-release per the obstetric emergency ' +
            'protocol, refer urgently for stabilisation and definitive management (delivery once ' +
            'stabilised). Do not delay magnesium for transport.',
          { reasons: severeReasons.join('; ') },
        ),
      ];
    }

    // 2 / 3. Mild pre-eclampsia vs gestational hypertension.
    if (elevated.length >= MIN_ELEVATED_READINGS) {
      const maxSys = Math.max(...elevated.map((r) => r.systolicMmHg));
      const maxDia = Math.max(...elevated.map((r) => r.diastolicMmHg));
      if (proteinuriaSignificant) {
        return [
          this.buildCard(
            rule,
            req,
            'warning',
            'Pre-eclampsia — close monitoring, plan referral for delivery',
            'BP ≥140/90 on ≥2 readings (max {{maxSys}}/{{maxDia}}) with proteinuria {{proteinuria}}. ' +
              'Admit or arrange daily follow-up: BP every 4 h, daily urine dipstick, daily foetal ' +
              'movement count, weekly bloods (FBC, creatinine, ALT/AST, LDH). Start antihypertensive ' +
              '(oral methyldopa 250 mg three times daily or labetalol 100 mg twice daily). If <34 wk, ' +
              'give antenatal corticosteroids for foetal lung maturity. Plan delivery from 37 wk or ' +
              'earlier if worsening features.',
            { maxSys, maxDia, proteinuria: proteinuriaLevel },
          ),
        ];
      }
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Gestational hypertension — weekly BP + proteinuria checks',
          'BP ≥140/90 on ≥2 readings (max {{maxSys}}/{{maxDia}}) without proteinuria. Per WHO ANC ' +
            'SMART: confirm BP, screen for proteinuria weekly, counsel on warning signs. Start ' +
            'antihypertensive therapy if BP persistently ≥150/100. Reassess for pre-eclampsia at ' +
            'every contact.',
          { maxSys, maxDia },
        ),
      ];
    }

    return [];
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
      label: 'WHO ANC SMART Guideline (2016)',
      url: 'https://www.who.int/publications/i/item/9789241549912',
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
