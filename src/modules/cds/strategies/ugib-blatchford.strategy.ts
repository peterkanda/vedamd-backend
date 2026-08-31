import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Glasgow-Blatchford Score (GBS) for upper GI bleeding — pre-endoscopy
 * risk stratification (Blatchford 2000; NICE NG141 / CG141).
 *
 * Why deterministic: GBS is a weighted additive score that decides
 * whether a patient with a GI bleed can be managed as an outpatient
 * (GBS 0–1) or needs admission + urgent endoscopy + transfusion. A
 * scoring slip can discharge an actively-bleeding patient. Computing
 * it exactly in code removes that error class.
 *
 * Components (max 23):
 *   Urea (mmol/L):  6.5–7.9 →2, 8.0–9.9 →3, 10.0–24.9 →4, ≥25 →6
 *   Hb men (g/L):   120–129 →1, 100–119 →3, <100 →6
 *   Hb women (g/L): 100–119 →1, <100 →6
 *   SBP (mmHg):     100–109 →1, 90–99 →2, <90 →3
 *   Pulse ≥100      →1
 *   Melaena         →1
 *   Syncope         →2
 *   Hepatic disease →2
 *   Cardiac failure →2
 *
 * GBS 0 (or ≤1 by some protocols) → very low risk, consider outpatient.
 * GBS ≥ 6 → high risk → urgent endoscopy + intervention.
 *
 * Anonymous-by-design. Reads only:
 *   context.suspectedUpperGiBleed  boolean sentinel (or haematemesis/melaena flags)
 *   context.haematemesis | context.melaena | context.syncope  booleans
 *   context.ureaMmolL  number
 *   context.hbGramsPerLitre  number   (g/L; auto-detects g/dL if < 25)
 *   context.sex  'male' | 'female'
 *   context.systolicMmHg | context.pulsePerMin  numbers
 *   context.hepaticDisease | context.cardiacFailure  booleans
 */

interface UgibContext {
  suspectedUpperGiBleed?: boolean;
  haematemesis?: boolean;
  melaena?: boolean;
  syncope?: boolean;
  ureaMmolL?: number;
  hbGramsPerLitre?: number;
  sex?: string;
  systolicMmHg?: number;
  pulsePerMin?: number;
  hepaticDisease?: boolean;
  cardiacFailure?: boolean;
}

@Injectable()
export class UgibBlatchfordStrategy implements CdsRuleStrategy {
  readonly type = 'upper-gi-bleed-blatchford';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as UgibContext;
    if (ctx.suspectedUpperGiBleed !== true && ctx.haematemesis !== true && ctx.melaena !== true) {
      return [];
    }

    const parts: string[] = [];
    const missing: string[] = [];
    let score = 0;

    // Urea
    if (typeof ctx.ureaMmolL === 'number') {
      const u = ctx.ureaMmolL;
      let pts = 0;
      if (u >= 25) pts = 6;
      else if (u >= 10) pts = 4;
      else if (u >= 8) pts = 3;
      else if (u >= 6.5) pts = 2;
      if (pts) {
        score += pts;
        parts.push(`urea ${u} (+${pts})`);
      }
    } else missing.push('urea');

    // Haemoglobin (sex-specific). Auto-detect g/dL (value < 25) → ×10.
    if (typeof ctx.hbGramsPerLitre === 'number') {
      const hb = ctx.hbGramsPerLitre < 25 ? ctx.hbGramsPerLitre * 10 : ctx.hbGramsPerLitre;
      const female = String(ctx.sex).toLowerCase() === 'female';
      // Men: <100 →6, 100–119 →3, 120–129 →1. Women: <100 →6, 100–119 →1.
      const pts = female
        ? hb < 100
          ? 6
          : hb < 120
            ? 1
            : 0
        : hb < 100
          ? 6
          : hb < 120
            ? 3
            : hb < 130
              ? 1
              : 0;
      if (pts) {
        score += pts;
        parts.push(`Hb ${hb} g/L (+${pts})`);
      }
    } else missing.push('haemoglobin');

    // Systolic BP
    if (typeof ctx.systolicMmHg === 'number') {
      const s = ctx.systolicMmHg;
      let pts = 0;
      if (s < 90) pts = 3;
      else if (s < 100) pts = 2;
      else if (s < 110) pts = 1;
      if (pts) {
        score += pts;
        parts.push(`SBP ${s} (+${pts})`);
      }
    } else missing.push('systolic BP');

    if (typeof ctx.pulsePerMin === 'number' && ctx.pulsePerMin >= 100) {
      score += 1;
      parts.push('pulse ≥100 (+1)');
    }
    if (ctx.melaena === true) {
      score += 1;
      parts.push('melaena (+1)');
    }
    if (ctx.syncope === true) {
      score += 2;
      parts.push('syncope (+2)');
    }
    if (ctx.hepaticDisease === true) {
      score += 2;
      parts.push('hepatic disease (+2)');
    }
    if (ctx.cardiacFailure === true) {
      score += 2;
      parts.push('cardiac failure (+2)');
    }

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (score >= 6) {
      indicator = 'critical';
      summary = `Upper GI bleed — Glasgow-Blatchford ${score} (high risk)`;
      recommendation =
        'High risk. Admit. Resuscitate (2 large-bore IV, group + crossmatch, restrictive transfusion target Hb 70–80 g/L). ' +
        'Urgent upper GI endoscopy within 24 h (within 12 h if unstable / variceal). If variceal suspected: terlipressin + ' +
        'prophylactic ceftriaxone. IV PPI per local protocol. Correct coagulopathy.';
    } else if (score >= 1) {
      indicator = 'warning';
      summary = `Upper GI bleed — Glasgow-Blatchford ${score} (admit for assessment)`;
      recommendation =
        'Not low-risk — admit for observation + inpatient endoscopy. Resuscitate as needed; restrictive transfusion ' +
        '(Hb 70–80 g/L); reassess. Do not discharge.';
    } else {
      indicator = 'info';
      summary = 'Upper GI bleed — Glasgow-Blatchford 0 (very low risk)';
      recommendation =
        'Very low risk — consider outpatient management with early (non-urgent) endoscopy per local pathway + clear ' +
        'safety-net advice, provided the patient is stable, reliable, and has support. Confirm no other concern.';
    }

    if (missing.length) {
      recommendation += ` NOTE: ${missing.join(', ')} not supplied — the score is a MINIMUM; obtain these to complete risk assessment.`;
    }

    const ref = rule.references[0] ?? {
      label: 'NICE CG141 Acute Upper GI Bleeding',
      url: 'https://www.nice.org.uk/guidance/cg141',
    };
    const detail = `Glasgow-Blatchford ${score} (${parts.join(' | ') || 'no positive components'}). ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score, components: parts.join(' | ') },
    );

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
