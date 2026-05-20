import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * MDR/RR-TB all-oral 6-month regimen builder — WHO 2022 Operational
 * Handbook / TB-PRACTECAL. Suggests BPaLM (bedaquiline + pretomanid +
 * linezolid + moxifloxacin) or BPaL (when fluoroquinolone resistance is
 * present) and surfaces the mandatory cardiac/hepatic/neuro monitoring.
 *
 * Why deterministic: regimen eligibility is rule-based, and the
 * additive QT risk of bedaquiline + moxifloxacin needs a hard ECG gate.
 *
 * Anonymous-by-design. Reads only:
 *   context.drugResistance string | string[] (RIF-resistance / MDR / FQ-resistance)
 *   context.weightKg number (linezolid dosing band)
 *   context.qtcMs number (QTcF; >500 ms is a hard stop)
 */

interface MdrTbContext {
  drugResistance?: unknown;
  weightKg?: number;
  qtcMs?: number;
}

@Injectable()
export class MdrTbRegimenStrategy implements CdsRuleStrategy {
  readonly type = 'mdr-tb-regimen-builder';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as MdrTbContext;
    const resistance = Array.isArray(ctx.drugResistance)
      ? (ctx.drugResistance as unknown[]).map((m) => String(m).toLowerCase())
      : ctx.drugResistance
        ? [String(ctx.drugResistance).toLowerCase()]
        : [];
    const resText = resistance.join(' ');
    const rifResistant = /rif|rr-tb|\bmdr\b|multidrug/.test(resText);
    if (!rifResistant) return [];

    const fqResistant = /fluoroquinolone|moxi|levofloxacin|\bfq\b|pre-?xdr|xdr/.test(resText);
    const qtc = ctx.qtcMs;
    const qtDanger = typeof qtc === 'number' && qtc > 500;

    let indicator: CdsIndicator = 'warning';
    const regimen = fqResistant
      ? 'BPaL (6 months, all-oral): bedaquiline + pretomanid + linezolid. Fluoroquinolone resistance precludes adding moxifloxacin.'
      : 'BPaLM (6 months, all-oral): bedaquiline + pretomanid + linezolid + moxifloxacin — WHO-preferred for fluoroquinolone-susceptible MDR/RR-TB.';

    let summary = fqResistant
      ? 'MDR/RR-TB — candidate regimen BPaL (FQ resistance present)'
      : 'MDR/RR-TB — candidate regimen BPaLM (all-oral, 6 months)';

    let qtNote =
      'Bedaquiline (and moxifloxacin) prolong the QT additively → baseline ECG then ECG at weeks 2, 4, 8, 12 and monthly; ' +
      'correct K⁺/Mg²⁺/Ca²⁺; avoid other QT-prolonging drugs.';
    if (qtDanger) {
      indicator = 'critical';
      summary = 'MDR/RR-TB — QTcF > 500 ms: HOLD QT-prolonging drugs before starting';
      qtNote =
        `QTcF ${qtc} ms exceeds 500 ms → do NOT start/continue bedaquiline + moxifloxacin until corrected. Repeat ECG, correct ` +
        'electrolytes, exclude other QT-prolonging agents, and seek MDR-TB specialist review before initiating.';
    }

    const linezolid =
      'Linezolid carries dose-dependent myelosuppression, peripheral + optic neuropathy → weekly FBC, weekly visual (colour/acuity) ' +
      'and neurological screen; reduce/interrupt linezolid for toxicity.';
    const monitoring = 'Also: baseline + monthly LFTs (pretomanid/bedaquiline hepatotoxicity), pregnancy test, and DST-guided review.';

    const ref = rule.references[0] ?? {
      label: 'WHO Operational Handbook on Tuberculosis — MDR-TB (2022)',
      url: 'https://www.who.int/publications/i/item/9789240065116',
    };
    const detail = `Resistance pattern: ${resistance.join(', ') || 'RIF-resistant'}. ${regimen} ${qtNote} ${linezolid} ${monitoring} ` +
      'Confirm eligibility (age, pregnancy, prior exposure) against the WHO handbook and register with the NTP.';

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, { summary, detail });

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
