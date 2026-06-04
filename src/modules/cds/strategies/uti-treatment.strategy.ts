import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Uncomplicated UTI — empirical antibiotic choice (NICE NG109; WHO
 * AWaRe). Deterministically routes by sex, pregnancy, trimester and
 * renal function: short-course nitrofurantoin/trimethoprim for
 * non-pregnant women, trimester-aware choices in pregnancy, and a
 * longer course + investigation for men.
 *
 * Anonymous-by-design. Reads only:
 *   context.suspectedUti boolean (sentinel)
 *   context.sex 'female' | 'male'
 *   context.pregnant boolean
 *   context.gestationWeeks number (trimester for pregnancy choice)
 *   context.eGFR number (nitrofurantoin needs eGFR ≥ 45)
 */

interface UtiContext {
  suspectedUti?: boolean;
  sex?: string;
  pregnant?: boolean;
  gestationWeeks?: number;
  eGFR?: number;
}

@Injectable()
export class UtiTreatmentStrategy implements CdsRuleStrategy {
  readonly type = 'uti-treatment';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as UtiContext;
    if (ctx.suspectedUti !== true) return [];

    const sex = ctx.sex?.toLowerCase();
    const nitroOk = !(typeof ctx.eGFR === 'number' && ctx.eGFR < 45);

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (sex === 'male') {
      indicator = 'warning';
      summary = 'UTI in a man — treat 7 days and investigate (not "uncomplicated")';
      recommendation =
        'UTI in men is treated as complicated → 7-day course (nitrofurantoin 100 mg modified-release twice daily if eGFR ≥ 45, ' +
        'or trimethoprim 200 mg twice daily where resistance < 20%). Consider prostatitis (use a fluoroquinolone/trimethoprim with ' +
        'good prostate penetration and 14–28 days if prostatitis is likely). Investigate for an underlying cause; safety-net for ' +
        'pyelonephritis (fever, loin pain, rigors → escalate).';
    } else if (ctx.pregnant === true) {
      indicator = 'warning';
      const thirdTrimester = typeof ctx.gestationWeeks === 'number' && ctx.gestationWeeks >= 28;
      summary = 'UTI in pregnancy — trimester-aware antibiotic + send culture';
      recommendation = thirdTrimester
        ? 'Pregnant, third trimester → AVOID nitrofurantoin near term (neonatal haemolysis risk). Use cefalexin 500 mg twice daily ' +
          'for 7 days (or per culture). Always send urine for culture, treat asymptomatic bacteriuria in pregnancy, and confirm cure.'
        : 'Pregnant, first/second trimester → nitrofurantoin 100 mg modified-release twice daily for 7 days is appropriate (avoid at ' +
          'term and if eGFR < 45); cefalexin is an alternative. AVOID trimethoprim in the first trimester (folate antagonist). Send ' +
          'urine for culture, treat asymptomatic bacteriuria, and confirm cure.';
    } else {
      indicator = 'info';
      summary = 'Uncomplicated cystitis (non-pregnant woman) — 3-day short course';
      recommendation = nitroOk
        ? 'Non-pregnant woman with cystitis → nitrofurantoin 100 mg modified-release twice daily for 3 days (first-line; AWaRe ' +
          'Access). Alternative: trimethoprim 200 mg twice daily for 3 days where local E. coli resistance is < 20%. Advise ' +
          'analgesia/hydration and safety-net for upper-tract symptoms.'
        : 'Non-pregnant woman with cystitis but eGFR < 45 → nitrofurantoin is contraindicated. Use trimethoprim 200 mg twice daily ' +
          'for 3 days (if local resistance < 20%) or pivmecillinam/fosfomycin per local guidance. Safety-net for pyelonephritis.';
    }

    const ref = rule.references[0] ?? {
      label: 'NICE NG109 Urinary tract infection (lower): antimicrobial prescribing',
      url: 'https://www.nice.org.uk/guidance/ng109',
    };
    const detail = recommendation;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, { summary, detail });

    return [
      {
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
      },
    ];
  }
}
