import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * COPD exacerbation severity (GOLD 2024 + WHO chronic-respiratory care).
 *
 * Tiers:
 *
 *   1. CRITICAL — severe exacerbation / respiratory failure indicators:
 *      acute confusion / drowsiness, RR ≥ 30, SpO₂ < 88 % on room air,
 *      use of accessory muscles, paradoxical chest movement, SBP < 90.
 *      → Admit. Controlled oxygen (target SpO₂ 88–92 %), nebulised
 *        salbutamol + ipratropium, oral prednisolone 40 mg, IV/oral
 *        antibiotic if purulent sputum or pneumonia, consider NIV (BiPAP)
 *        if pH < 7.35 / PaCO₂ ≥ 45.
 *
 *   2. WARNING — moderate exacerbation:
 *      increased dyspnoea / sputum volume / sputum purulence — at least
 *      two of these (Anthonisen criteria) — without severe features.
 *      → Manage in primary care with bronchodilators + 5-day oral
 *        prednisolone + 5-day oral amoxicillin (or doxycycline) per local
 *        sensitivity if purulent sputum or any cardinal symptom.
 *
 *   3. INFO — increased symptoms without exacerbation criteria:
 *      counsel inhaler technique, smoking cessation, vaccination,
 *      action plan.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 18
 *   context.knownCopd                 boolean (sentinel)
 *   context.increasedDyspnoea         boolean
 *   context.increasedSputumVolume     boolean
 *   context.sputumPurulent            boolean
 *   context.respiratoryRatePerMin     number
 *   context.oxygenSatPercent          number
 *   context.confusionOrDrowsiness     boolean
 *   context.accessoryMuscleUse        boolean
 *   context.systolicMmHg              number (optional — shock flag)
 *   context.feverC                    number (optional — concomitant pneumonia)
 */

const ADULT_AGE_YEARS = 18;
const SEVERE_RR = 30;
const SEVERE_SPO2 = 88;
const SHOCK_SBP = 90;

interface CopdContext {
  ageYears?: number;
  knownCopd?: boolean;
  increasedDyspnoea?: boolean;
  increasedSputumVolume?: boolean;
  sputumPurulent?: boolean;
  respiratoryRatePerMin?: number;
  oxygenSatPercent?: number;
  confusionOrDrowsiness?: boolean;
  accessoryMuscleUse?: boolean;
  systolicMmHg?: number;
  feverC?: number;
}

@Injectable()
export class CopdExacerbationStrategy implements CdsRuleStrategy {
  readonly type = 'copd-exacerbation';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CopdContext;
    if (ctx.knownCopd !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const severeReasons: string[] = [];
    if (ctx.confusionOrDrowsiness === true) severeReasons.push('new confusion / drowsiness');
    if (typeof ctx.respiratoryRatePerMin === 'number' && ctx.respiratoryRatePerMin >= SEVERE_RR) {
      severeReasons.push(`RR ${ctx.respiratoryRatePerMin}/min (≥ ${SEVERE_RR})`);
    }
    if (
      typeof ctx.oxygenSatPercent === 'number' &&
      ctx.oxygenSatPercent > 0 &&
      ctx.oxygenSatPercent < SEVERE_SPO2
    ) {
      severeReasons.push(`SpO₂ ${ctx.oxygenSatPercent}% (< ${SEVERE_SPO2})`);
    }
    if (ctx.accessoryMuscleUse === true)
      severeReasons.push('accessory-muscle use / paradoxical chest movement');
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SHOCK_SBP) {
      severeReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< ${SHOCK_SBP})`);
    }

    if (severeReasons.length > 0) {
      const antibioticLine =
        ctx.sputumPurulent === true || (typeof ctx.feverC === 'number' && ctx.feverC >= 38)
          ? 'Add an antibiotic (oral amoxicillin 500 mg three times daily or doxycycline 100 mg twice daily for 5 days; IV ' +
            'ceftriaxone if pneumonic or admitted): purulent sputum or concurrent pneumonia present.'
          : 'Antibiotic not routinely indicated unless sputum is purulent or pneumonia is suspected.';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe COPD exacerbation — admit, controlled oxygen, escalate to NIV if pH < 7.35',
          'Severe-feature(s): {{reasons}}. Admit. Controlled oxygen targeting SpO₂ 88–92 % (use a Venturi mask if available — ' +
            'high-flow oxygen risks worsening hypercapnoea). Nebulised salbutamol 5 mg + ipratropium 500 µg every 4–6 h. Oral ' +
            'prednisolone 40 mg daily for 5 days (IV hydrocortisone 100 mg if vomiting or NBM). ' +
            '{{antibiotic}} Obtain ABG / venous blood gas; if pH < 7.35 with PaCO₂ ≥ 45 mmHg, start non-invasive ventilation ' +
            '(BiPAP) and arrange ICU transfer.',
          { reasons: severeReasons.join('; '), antibiotic: antibioticLine },
        ),
      ];
    }

    const cardinalCount = [
      ctx.increasedDyspnoea === true,
      ctx.increasedSputumVolume === true,
      ctx.sputumPurulent === true,
    ].filter(Boolean).length;

    if (cardinalCount >= 2) {
      const abx =
        ctx.sputumPurulent === true
          ? 'Add 5 days of oral amoxicillin 500 mg three times daily (or doxycycline 100 mg twice daily, or amoxicillin-clavulanate if local resistance) — purulent-sputum criterion met.'
          : 'Antibiotics generally NOT needed when sputum is not purulent — re-assess at 48–72 h if no improvement.';
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Moderate COPD exacerbation — bronchodilators + 5-day oral prednisolone',
          'Anthonisen cardinal-symptom count: {{cardinalCount}}/3. Manage in primary care: increase short-acting bronchodilator ' +
            '(salbutamol 4–10 puffs via spacer every 4 h plus ipratropium 2–4 puffs); oral prednisolone 40 mg daily for 5 days. ' +
            '{{antibiotic}} Review inhaler technique, ensure smoking-cessation support, update influenza / pneumococcal vaccination. ' +
            'Re-assess at 48–72 h; escalate if no improvement, sputum becomes purulent, or any severe feature develops.',
          { cardinalCount, antibiotic: abx },
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Increased symptoms without exacerbation criteria — review controller therapy',
        'Symptoms increased but Anthonisen criteria not met. Review controller (long-acting bronchodilator ± ICS for ' +
          'frequent exacerbators), inhaler technique, written action plan, smoking-cessation support and vaccination status. ' +
          'Counsel on return-immediately signs (new fever, purulent sputum, breathlessness at rest, confusion, chest pain).',
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
      label: 'GOLD — Global Initiative for Chronic Obstructive Lung Disease (2024)',
      url: 'https://goldcopd.org/',
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
