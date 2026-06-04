import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Adult community-acquired pneumonia severity — CRB-65 (community
 * variant; no urea required at primary-care point of decision).
 *
 *   CRB-65 components (1 point each):
 *     C — Confusion (new disorientation in time / place / person)
 *     R — Respiratory rate ≥ 30/min
 *     B — Blood pressure: systolic < 90 OR diastolic ≤ 60 mmHg
 *     65 — Age ≥ 65 years
 *
 *   Score → action:
 *     0       → low risk     INFO     outpatient oral amoxicillin
 *     1–2     → moderate     WARNING  consider hospital assessment;
 *                                     macrolide added in severe
 *                                     atypical cover
 *     3–4     → high risk    CRITICAL hospital admission required;
 *                                     IV antibiotics + oxygen
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                 number (≥ 18 to fire)
 *   context.suspectedPneumonia       boolean (sentinel — fires only
 *                                    when the clinician has clinical
 *                                    suspicion of pneumonia)
 *   context.confusion                boolean
 *   context.respiratoryRatePerMin    number
 *   context.systolicMmHg             number
 *   context.diastolicMmHg            number
 *   context.oxygenSatPercent         number (optional — < 92 % is
 *                                    an additional admission flag
 *                                    not captured by CRB-65)
 */

const ADULT_AGE_YEARS = 18;
const RR_THRESHOLD = 30;
const SBP_THRESHOLD = 90;
const DBP_THRESHOLD = 60;
const AGE_THRESHOLD = 65;
const SPO2_ADMIT_THRESHOLD = 92;

interface CapContext {
  ageYears?: number;
  suspectedPneumonia?: boolean;
  confusion?: boolean;
  respiratoryRatePerMin?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  oxygenSatPercent?: number;
}

@Injectable()
export class AdultCapCrb65Strategy implements CdsRuleStrategy {
  readonly type = 'adult-cap-crb65';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CapContext;
    if (ctx.suspectedPneumonia !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const components: string[] = [];
    let score = 0;

    if (ctx.confusion === true) {
      score += 1;
      components.push('C: confusion');
    }
    if (typeof ctx.respiratoryRatePerMin === 'number' && ctx.respiratoryRatePerMin >= RR_THRESHOLD) {
      score += 1;
      components.push(`R: RR ${ctx.respiratoryRatePerMin}/min (≥ ${RR_THRESHOLD})`);
    }
    const sbpHit =
      typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SBP_THRESHOLD;
    const dbpHit =
      typeof ctx.diastolicMmHg === 'number' && ctx.diastolicMmHg <= DBP_THRESHOLD;
    if (sbpHit || dbpHit) {
      score += 1;
      components.push(
        `B: BP ${typeof ctx.systolicMmHg === 'number' ? ctx.systolicMmHg : '?'}/${typeof ctx.diastolicMmHg === 'number' ? ctx.diastolicMmHg : '?'} mmHg`,
      );
    }
    if (ctx.ageYears >= AGE_THRESHOLD) {
      score += 1;
      components.push(`65: age ${ctx.ageYears}`);
    }

    const lowSpo2 =
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < SPO2_ADMIT_THRESHOLD;

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (score >= 3) {
      indicator = 'critical';
      summary = 'CAP — CRB-65 high risk (score 3–4): admit and start IV antibiotics';
      recommendation =
        'Hospital admission required. Start IV antibiotic per local sensitivity (commonly ceftriaxone 1–2 g daily + ' +
        'azithromycin 500 mg daily for atypical cover). Oxygen to target SpO₂ 94–98 % (88–92 % if at risk of hypercapnoea). ' +
        'IV fluids cautiously; consider sepsis workup and HIV / TB co-evaluation.';
    } else if (score >= 1 || lowSpo2) {
      indicator = 'warning';
      summary = `CAP — CRB-65 moderate risk (score ${score})${lowSpo2 ? ' + low SpO₂' : ''}: consider admission`;
      recommendation =
        'Arrange hospital assessment or short-stay observation. If managed as outpatient, oral amoxicillin 1 g three ' +
        'times daily for 5 days + macrolide if atypical pathogens are suspected, with safety-net advice and follow-up at ' +
        '48–72 h. Re-evaluate the plan if SpO₂ < 92 % on room air.';
    } else {
      indicator = 'info';
      summary = 'CAP — CRB-65 low risk (score 0): outpatient management';
      recommendation =
        'Outpatient management with oral amoxicillin 500 mg–1 g three times daily for 5 days. Counsel return-immediately ' +
        'signs (worsening breathlessness, new confusion, fever > 48 h after starting antibiotic, haemoptysis). Follow up at ' +
        '5–7 days; consider chest X-ray if no improvement.';
    }

    const ref = rule.references[0] ?? {
      label: 'BTS / WHO Adult CAP Management',
      url: 'https://www.who.int/publications/i/item/9789241549349',
    };
    const detailParts = [`CRB-65 score ${score} (${components.join(' | ') || 'no components present'}).`];
    if (lowSpo2) {
      detailParts.push(
        `Pulse oximetry: ${ctx.oxygenSatPercent}% — below the 92% admission flag; treat as moderate risk regardless of CRB-65.`,
      );
    }
    detailParts.push(recommendation);

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      {
        summary,
        detail: detailParts.join(' '),
      },
      { score, components: components.join(' | ') },
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
