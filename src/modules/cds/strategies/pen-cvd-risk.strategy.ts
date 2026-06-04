import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO PEN — total cardiovascular risk assessment (WHO/ISH HEARTS approach).
 *
 * Approximation of the WHO/ISH 10-year fatal + non-fatal CVD risk
 * chart for low-resource settings (no-cholesterol variant). The
 * authoritative chart is two-dimensional with cholesterol bands; here
 * we score with a deterministic, conservative heuristic and clearly
 * label the output as approximate. Use is for triage / counselling,
 * not as a substitute for the published chart.
 *
 * Pipeline:
 *
 *   1. Anyone with established atherosclerotic CVD             → CRITICAL,
 *      very-high band ("secondary prevention"). Skip scoring.
 *
 *   2. Score otherwise:
 *
 *      Age points:     40–49 → 0,  50–59 → 5, 60–69 → 10, 70+ → 15
 *      Sex points:     male  → 3,  female → 0
 *      SBP points:     <140 → 0, 140–159 → 5, 160–179 → 10, ≥180 → 15
 *      Smoker:         current → 5
 *      Diabetes:       yes → 5
 *      Cholesterol points (if mmol/L supplied):
 *        <5.0 → 0,  5.0–5.9 → 2,  6.0–6.9 → 4,  ≥7.0 → 6
 *
 *      Total → Band:
 *        < 10  → low        ( <10% )
 *        10–19 → moderate   (10–20%)
 *        20–29 → high       (20–30%)
 *        ≥ 30  → very high  ( ≥30%)
 *
 * Bands map to PEN-aligned actions; the card emits the band, the
 * components, and the WHO/ISH-aligned management recommendations.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                    number (40–74 fires; outside → no card)
 *   context.sex                         'male' | 'female'
 *   context.systolicMmHg                number (one recent reading)
 *   context.smoker                      boolean
 *   context.diabetes                    boolean
 *   context.totalCholesterolMmolL       number, optional
 *   context.knownAtheroscleroticCvd     boolean, optional
 */

interface CvdContext {
  ageYears?: number;
  sex?: 'male' | 'female';
  systolicMmHg?: number;
  smoker?: boolean;
  diabetes?: boolean;
  totalCholesterolMmolL?: number;
  knownAtheroscleroticCvd?: boolean;
}

@Injectable()
export class PenCvdRiskStrategy implements CdsRuleStrategy {
  readonly type = 'pen-cvd-risk';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CvdContext;

    if (typeof ctx.ageYears !== 'number') return [];
    if (ctx.ageYears < 40 || ctx.ageYears >= 75) return []; // WHO/ISH chart window
    if (ctx.sex !== 'male' && ctx.sex !== 'female') return [];
    if (typeof ctx.systolicMmHg !== 'number' || ctx.systolicMmHg < 70 || ctx.systolicMmHg > 260) {
      return [];
    }

    // Secondary-prevention shortcut.
    if (ctx.knownAtheroscleroticCvd === true) {
      return [
        this.buildCard(rule, req, 'very-high', null, ctx, [
          'Established atherosclerotic CVD — manage as very-high-risk regardless of score (secondary prevention).',
        ]),
      ];
    }

    // Score.
    const parts: string[] = [];
    let pts = 0;

    const agePts = ctx.ageYears < 50 ? 0 : ctx.ageYears < 60 ? 5 : ctx.ageYears < 70 ? 10 : 15;
    pts += agePts;
    parts.push(`age ${ctx.ageYears} (+${agePts})`);

    const sexPts = ctx.sex === 'male' ? 3 : 0;
    pts += sexPts;
    parts.push(`sex ${ctx.sex} (+${sexPts})`);

    const sbpPts =
      ctx.systolicMmHg < 140 ? 0 : ctx.systolicMmHg < 160 ? 5 : ctx.systolicMmHg < 180 ? 10 : 15;
    pts += sbpPts;
    parts.push(`SBP ${ctx.systolicMmHg} (+${sbpPts})`);

    const smokerPts = ctx.smoker === true ? 5 : 0;
    if (ctx.smoker === true) {
      pts += smokerPts;
      parts.push(`current smoker (+${smokerPts})`);
    }

    const dmPts = ctx.diabetes === true ? 5 : 0;
    if (ctx.diabetes === true) {
      pts += dmPts;
      parts.push(`diabetes (+${dmPts})`);
    }

    if (typeof ctx.totalCholesterolMmolL === 'number') {
      const tc = ctx.totalCholesterolMmolL;
      const cholPts = tc < 5 ? 0 : tc < 6 ? 2 : tc < 7 ? 4 : 6;
      pts += cholPts;
      parts.push(`total cholesterol ${tc.toFixed(1)} (+${cholPts})`);
    }

    const band = bandFor(pts);
    return [
      this.buildCard(rule, req, band, pts, ctx, [
        `Approximate WHO/ISH score ${pts} → ${bandLabel(band)} band.`,
        `Inputs: ${parts.join('; ')}.`,
      ]),
    ];
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    band: CvdBand,
    score: number | null,
    ctx: CvdContext,
    leadingLines: string[],
  ): CdsCard {
    const indicator: CdsIndicator =
      band === 'very-high'
        ? 'critical'
        : band === 'high' || band === 'moderate'
          ? 'warning'
          : 'info';

    const summary =
      band === 'very-high'
        ? 'Very-high CVD risk — manage now per PEN-HEARTS'
        : band === 'high'
          ? 'High 10-year CVD risk — initiate combined management'
          : band === 'moderate'
            ? 'Moderate 10-year CVD risk — intensify lifestyle, consider pharmacotherapy'
            : 'Low 10-year CVD risk — lifestyle-first, reassess in 12 months';

    const advice = managementFor(band, ctx);
    const detail = [...leadingLines, advice].join(' ');

    const ref = rule.references[0] ?? {
      label: 'WHO PEN — HEARTS technical package',
      url: 'https://www.who.int/publications/i/item/9789241514613',
    };
    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score: score ?? '—', band },
    );
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

type CvdBand = 'low' | 'moderate' | 'high' | 'very-high';

function bandFor(score: number): CvdBand {
  if (score < 10) return 'low';
  if (score < 20) return 'moderate';
  if (score < 30) return 'high';
  return 'very-high';
}

function bandLabel(b: CvdBand): string {
  return b === 'very-high'
    ? 'very-high (≥30%)'
    : b === 'high'
      ? 'high (20–30%)'
      : b === 'moderate'
        ? 'moderate (10–20%)'
        : 'low (<10%)';
}

function managementFor(band: CvdBand, ctx: CvdContext): string {
  const base =
    'Reinforce salt reduction, weight reduction, physical activity (≥150 min/week moderate), ' +
    'tobacco cessation, and DASH-style diet.';
  if (band === 'low') {
    return `${base} No drug therapy on the basis of risk alone; reassess in 12 months.`;
  }
  if (band === 'moderate') {
    return (
      `${base} Treat hypertension to <140/90 (consider <130/80 in tolerated patients) ` +
      'with a thiazide or ACE inhibitor as first line. Reassess CVD risk in 6–12 months.'
    );
  }
  if (band === 'high') {
    return (
      `${base} Initiate antihypertensive therapy (typically dual: ACE inhibitor + thiazide ` +
      'or amlodipine), start moderate-intensity statin (atorvastatin 20 mg) regardless of LDL, ' +
      'and treat diabetes to HbA1c < 7%. Reassess in 3–6 months.'
    );
  }
  // very-high
  return (
    'Treat as very high risk: aggressive BP control (target <130/80 if tolerated), ' +
    'high-intensity statin (atorvastatin 40–80 mg), low-dose aspirin only if established CVD, ' +
    'tight diabetes control, urgent specialist input if newly recognised. ' +
    `${ctx.knownAtheroscleroticCvd ? 'Confirm secondary-prevention medications are in place.' : ''}`
  );
}
