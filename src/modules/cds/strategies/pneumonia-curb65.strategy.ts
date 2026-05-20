import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * CURB-65 severity score for community-acquired pneumonia in adults,
 * with score-keyed antibiotic selection (BTS CAP 2009/2015; IDSA 2019).
 * The hospital-grade companion to CRB-65 ([[adult-cap-crb65]]) — adds the
 * Urea criterion, so it fires when a blood result is available and drives
 * the admission tier plus the specific (AWaRe-tagged) antibiotic regimen.
 *
 * Why deterministic: a 5-point additive score whose bands gate site of
 * care (home / ward / ICU assessment) and antibiotic intensity. Manual
 * mis-scoring → under-treatment of severe pneumonia or unnecessary
 * admission/broad-spectrum antibiotics (AWaRe stewardship harm).
 *
 * CURB-65 components (1 point each):
 *   C — Confusion (new disorientation / AMT ≤ 8)
 *   U — Urea > 7 mmol/L
 *   R — Respiratory rate ≥ 30/min
 *   B — Blood pressure: systolic < 90 OR diastolic ≤ 60 mmHg
 *   65 — Age ≥ 65 years
 *   0–1 low (outpatient) | 2 moderate (ward) | 3–5 high (admit ± ICU).
 *
 * Anonymous-by-design. Reads only:
 *   context.suspectedPneumonia       boolean sentinel
 *   context.ageYears                 number (gates adult + the "65" point)
 *   context.confusion                boolean
 *   context.ureaMmolL | context.urea number (mmol/L; > 7 scores)
 *   context.respiratoryRatePerMin | context.respiratoryRate  number
 *   context.systolicMmHg | context.systolicBp                number
 *   context.diastolicMmHg | context.diastolicBp              number
 *   context.oxygenSatPercent         number (low SpO₂ flags admission)
 */

const ADULT_AGE_YEARS = 18;
const UREA_THRESHOLD = 7;
const RR_THRESHOLD = 30;
const SBP_THRESHOLD = 90;
const DBP_THRESHOLD = 60;
const AGE_THRESHOLD = 65;
const SPO2_ADMIT_THRESHOLD = 92;

interface CurbContext {
  suspectedPneumonia?: boolean;
  ageYears?: number;
  confusion?: boolean;
  ureaMmolL?: number;
  urea?: number;
  respiratoryRatePerMin?: number;
  respiratoryRate?: number;
  systolicMmHg?: number;
  systolicBp?: number;
  diastolicMmHg?: number;
  diastolicBp?: number;
  oxygenSatPercent?: number;
}

@Injectable()
export class PneumoniaCurb65Strategy implements CdsRuleStrategy {
  readonly type = 'pneumonia-curb65-treatment';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CurbContext;
    if (ctx.suspectedPneumonia !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const urea = typeof ctx.ureaMmolL === 'number' ? ctx.ureaMmolL : ctx.urea;
    const rr = typeof ctx.respiratoryRatePerMin === 'number' ? ctx.respiratoryRatePerMin : ctx.respiratoryRate;
    const sbp = typeof ctx.systolicMmHg === 'number' ? ctx.systolicMmHg : ctx.systolicBp;
    const dbp = typeof ctx.diastolicMmHg === 'number' ? ctx.diastolicMmHg : ctx.diastolicBp;

    const components: string[] = [];
    const missing: string[] = [];
    let score = 0;

    if (ctx.confusion === true) { score += 1; components.push('C: confusion'); }
    else if (ctx.confusion === undefined) missing.push('confusion');

    if (typeof urea === 'number') {
      if (urea > UREA_THRESHOLD) { score += 1; components.push(`U: urea ${urea} mmol/L (> ${UREA_THRESHOLD})`); }
    } else {
      missing.push('urea');
    }

    if (typeof rr === 'number') {
      if (rr >= RR_THRESHOLD) { score += 1; components.push(`R: RR ${rr}/min (≥ ${RR_THRESHOLD})`); }
    } else {
      missing.push('respiratory rate');
    }

    const sbpHit = typeof sbp === 'number' && sbp < SBP_THRESHOLD;
    const dbpHit = typeof dbp === 'number' && dbp <= DBP_THRESHOLD;
    if (sbpHit || dbpHit) {
      score += 1;
      components.push(`B: BP ${typeof sbp === 'number' ? sbp : '?'}/${typeof dbp === 'number' ? dbp : '?'} mmHg`);
    } else if (typeof sbp !== 'number' && typeof dbp !== 'number') {
      missing.push('blood pressure');
    }

    if (ctx.ageYears >= AGE_THRESHOLD) { score += 1; components.push(`65: age ${ctx.ageYears}`); }

    const incomplete = missing.length > 0;
    const lowSpo2 =
      typeof ctx.oxygenSatPercent === 'number' && ctx.oxygenSatPercent > 0 && ctx.oxygenSatPercent < SPO2_ADMIT_THRESHOLD;

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (score >= 3) {
      indicator = 'critical';
      summary = `CAP — CURB-65 ${score} (high risk): admit, IV antibiotics, assess for ICU`;
      recommendation =
        'High-severity pneumonia → hospital admission; assess for ICU/HDU when CURB-65 is 4–5 or there is shock/respiratory ' +
        'failure. Start IV co-amoxiclav 1.2 g every 8 h PLUS a macrolide (clarithromycin 500 mg every 12 h) — or IV ceftriaxone ' +
        '1–2 g daily + macrolide where co-amoxiclav is unsuitable. Oxygen to target SpO₂ 94–98 % (88–92 % if at risk of ' +
        'hypercapnoea), cautious IV fluids, sepsis workup. Consider HIV and TB co-evaluation. (AWaRe: co-amoxiclav/ceftriaxone = Watch.)';
    } else if (score === 2 || lowSpo2) {
      indicator = 'warning';
      summary = `CAP — CURB-65 ${score} (moderate risk)${lowSpo2 ? ' + low SpO₂' : ''}: consider hospital/ward care`;
      recommendation =
        'Moderate-severity pneumonia → consider short-stay/ward admission or closely supervised outpatient care. Amoxicillin ' +
        '500 mg–1 g three times daily PLUS a macrolide (clarithromycin 500 mg twice daily) for atypical cover; use doxycycline ' +
        '100 mg twice daily for penicillin allergy. Reassess at 48 h. (AWaRe: amoxicillin = Access; macrolide/doxycycline = Watch/Access.)';
    } else {
      indicator = 'info';
      summary = `CAP — CURB-65 ${score} (low risk): outpatient management`;
      recommendation =
        'Low-severity pneumonia → outpatient management is usually appropriate. Amoxicillin 500 mg three times daily for 5 days ' +
        '(doxycycline 100 mg twice daily or clarithromycin 500 mg twice daily if penicillin-allergic). Safety-net: return for ' +
        'worsening breathlessness, new confusion, persistent fever > 48 h after starting antibiotics, or haemoptysis. Review at 48 h. ' +
        '(AWaRe: amoxicillin = Access.)';
    }

    const ref = rule.references[0] ?? {
      label: 'BTS Community-Acquired Pneumonia Guideline',
      url: 'https://www.brit-thoracic.org.uk/quality-improvement/guidelines/pneumonia-adults/',
    };

    const incompleteText = incomplete
      ? ` ${missing.length} CURB-65 input(s) not supplied (${missing.join(', ')}) — score is a minimum until completed.`
      : '';
    const spo2Text = lowSpo2
      ? ` SpO₂ ${ctx.oxygenSatPercent}% is below the 92% admission flag — treat as at least moderate risk regardless of score.`
      : '';
    const detail = `CURB-65 score ${score} (${components.join(' | ') || 'no components present'}).${incompleteText}${spo2Text} ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score, components: components.join(' | ') },
    );

    return [
      {
        summary: outSummary,
        indicator,
        detail: outDetail.replace(/\s+/g, ' ').trim(),
        source: { label: ref.label, url: ref.url },
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
