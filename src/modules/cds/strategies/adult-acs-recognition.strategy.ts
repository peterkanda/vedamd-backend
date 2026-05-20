import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Acute coronary syndrome — early recognition + emergency bundle.
 *
 * Aligned to WHO PEN-HEARTS acute coronary care + Kenya MoH clinical
 * guidelines. The rule fires only when the integrator confirms chest
 * pain or a high-risk equivalent presentation via the
 * `suspectedAcs` sentinel.
 *
 * Tiers:
 *
 *   1. CRITICAL — STEMI / high-risk-NSTEACS pattern:
 *      any of (a) ongoing chest pain ≥ 20 min AND any "typical
 *      feature", (b) haemodynamic instability (SBP < 90, HR > 110,
 *      shock), (c) ST-elevation reported, (d) ongoing pain with prior
 *      MI/PCI history.
 *      → urgent transfer, dual antiplatelet load (aspirin 300 mg
 *        chewed + clopidogrel 300 mg), GTN if SBP > 100, morphine for
 *        ongoing pain, oxygen if SpO₂ < 90 %, statin loading dose,
 *        target door-to-balloon < 90 min or door-to-needle < 30 min.
 *
 *   2. WARNING — possible ACS:
 *      typical features without ongoing pain ≥ 20 min, OR atypical
 *      features with ≥ 2 risk factors (smoker, DM, HTN, dyslipidaemia,
 *      family history of premature CAD, age ≥ 65, prior ACS).
 *      → 12-lead ECG within 10 min, troponin at 0 + 3 h, aspirin
 *        300 mg pending workup, observe in a monitored setting.
 *
 *   3. INFO — low-risk presentation:
 *      no typical features, no instability, no risk-factor stacking.
 *      → still obtain ECG; explain return-immediately signs.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                 number ≥ 18
 *   context.suspectedAcs             boolean (sentinel; rule silent
 *                                    without it)
 *   context.painOngoingMin           number (minutes; 0 if no pain
 *                                    currently)
 *   context.typicalFeatures          string[] — codes:
 *                                    'chest-pressure-or-tightness',
 *                                    'radiation-to-arm-or-jaw',
 *                                    'exertional',
 *                                    'diaphoresis',
 *                                    'nausea-or-vomiting',
 *                                    'dyspnoea'
 *   context.systolicMmHg             number
 *   context.heartRatePerMin          number
 *   context.shockOrHypoperfusion     boolean
 *   context.stElevationReported      boolean
 *   context.priorMiOrPci             boolean
 *   context.riskFactors              string[] — codes:
 *                                    'smoker','dm','htn','dyslipidaemia',
 *                                    'family-cad','age-ge-65','prior-acs'
 *   context.oxygenSatPercent         number (optional)
 */

const ADULT_AGE_YEARS = 18;
const ONGOING_PAIN_MIN = 20;
const SHOCK_SBP = 90;
const HIGH_HR = 110;

const TYPICAL_FEATURE_LABELS: Record<string, string> = {
  'chest-pressure-or-tightness': 'chest pressure or tightness',
  'radiation-to-arm-or-jaw': 'radiation to arm or jaw',
  exertional: 'exertional onset',
  diaphoresis: 'diaphoresis',
  'nausea-or-vomiting': 'nausea or vomiting',
  dyspnoea: 'dyspnoea',
};

const RISK_FACTOR_LABELS: Record<string, string> = {
  smoker: 'current smoker',
  dm: 'diabetes',
  htn: 'hypertension',
  dyslipidaemia: 'dyslipidaemia',
  'family-cad': 'family history of premature CAD',
  'age-ge-65': 'age ≥ 65',
  'prior-acs': 'prior ACS or PCI',
};

interface AcsContext {
  ageYears?: number;
  suspectedAcs?: boolean;
  painOngoingMin?: number;
  typicalFeatures?: string[];
  systolicMmHg?: number;
  heartRatePerMin?: number;
  shockOrHypoperfusion?: boolean;
  stElevationReported?: boolean;
  priorMiOrPci?: boolean;
  riskFactors?: string[];
  oxygenSatPercent?: number;
}

@Injectable()
export class AdultAcsRecognitionStrategy implements CdsRuleStrategy {
  readonly type = 'adult-acs-recognition';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AcsContext;
    if (ctx.suspectedAcs !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const typical = Array.isArray(ctx.typicalFeatures)
      ? ctx.typicalFeatures.filter(
          (s): s is string => typeof s === 'string' && s in TYPICAL_FEATURE_LABELS,
        )
      : [];
    const risk = Array.isArray(ctx.riskFactors)
      ? ctx.riskFactors.filter((s): s is string => typeof s === 'string' && s in RISK_FACTOR_LABELS)
      : [];

    const ongoingPain =
      typeof ctx.painOngoingMin === 'number' && ctx.painOngoingMin >= ONGOING_PAIN_MIN;
    const instability =
      ctx.shockOrHypoperfusion === true ||
      (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SHOCK_SBP) ||
      (typeof ctx.heartRatePerMin === 'number' && ctx.heartRatePerMin > HIGH_HR);
    const stemiPattern = ctx.stElevationReported === true;
    const priorMi = ctx.priorMiOrPci === true;

    const criticalReasons: string[] = [];
    if (ongoingPain && typical.length > 0) {
      criticalReasons.push(
        `ongoing pain ≥ ${ONGOING_PAIN_MIN} min with typical features: ${typical.map((c) => TYPICAL_FEATURE_LABELS[c]).join(', ')}`,
      );
    }
    if (instability) {
      criticalReasons.push(
        'haemodynamic instability (shock, SBP < 90, or HR > 110)',
      );
    }
    if (stemiPattern) criticalReasons.push('reported ST-segment elevation on ECG');
    if (priorMi && ongoingPain) {
      criticalReasons.push('ongoing pain with documented prior MI / PCI');
    }

    const sustainedHypoxia =
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < 90;
    if (sustainedHypoxia) criticalReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< 90%)`);

    if (criticalReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Suspected ACS / STEMI — activate emergency bundle and refer urgently',
          'High-risk feature(s): {{reasons}}. Per WHO PEN-HEARTS acute coronary care and Kenya MoH cardiology guidance: ' +
            'give aspirin 300 mg chewed + clopidogrel 300 mg loading dose; sublingual GTN 0.4 mg every 5 min × 3 (hold if ' +
            'SBP < 100 mmHg or RV infarct suspected); morphine 2–4 mg IV titrated for persistent pain; oxygen only if ' +
            'SpO₂ < 90 %; statin loading (atorvastatin 80 mg). Activate the local STEMI pathway — target door-to-balloon ' +
            '< 90 min if primary PCI available, or door-to-needle < 30 min for thrombolysis where indicated. Continuous ECG ' +
            'monitoring; prepare for VF / VT.',
          { reasons: criticalReasons.join('; ') },
        ),
      ];
    }

    if (typical.length > 0 || risk.length >= 2) {
      const reasonsParts: string[] = [];
      if (typical.length > 0) {
        reasonsParts.push(`features: ${typical.map((c) => TYPICAL_FEATURE_LABELS[c]).join(', ')}`);
      }
      if (risk.length > 0) {
        reasonsParts.push(`risk factors: ${risk.map((c) => RISK_FACTOR_LABELS[c]).join(', ')}`);
      }
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Possible ACS — obtain 12-lead ECG within 10 minutes and serial troponins',
          'Mid-risk presentation: {{reasons}}. Obtain a 12-lead ECG within 10 minutes; check high-sensitivity troponin at 0 ' +
            'and 3 hours. Give aspirin 300 mg chewed pending workup. Observe in a monitored area. Reassess pain at 30 min; ' +
            'escalate to the STEMI / high-risk bundle if any critical feature appears.',
          { reasons: reasonsParts.join('; ') },
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Low-risk chest pain — still get a 12-lead ECG and counsel return-immediately signs',
        'No typical ACS features, no instability, no risk-factor stacking. Obtain a 12-lead ECG to document baseline and ' +
          'rule out silent ischaemia. Counsel return-immediately signs: chest pressure lasting > 20 min, radiation, ' +
          'sweating, breathlessness, fainting.',
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
      label: 'WHO PEN — HEARTS technical package',
      url: 'https://www.who.int/publications/i/item/9789241514613',
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
