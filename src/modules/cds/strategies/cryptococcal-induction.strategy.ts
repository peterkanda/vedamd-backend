import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Cryptococcal meningitis induction therapy — WHO 2022 / AMBITION-cm.
 * In an advanced-HIV patient with a positive cryptococcal antigen and
 * meningitis, the preferred induction is a single high dose of
 * liposomal amphotericin B plus flucytosine plus fluconazole; a
 * 7-day amphotericin B deoxycholate + flucytosine backbone is the
 * fallback where liposomal is unavailable.
 *
 * Anonymous-by-design. Reads only:
 *   context.crAg boolean | 'positive' | context.suspectedCryptococcalMeningitis boolean (sentinel)
 *   context.csfOpeningPressure number (cmH₂O; ≥25 → therapeutic drainage)
 *   context.eGFR number (renal toxicity vigilance)
 *   context.liposomalAvailable boolean (selects preferred vs fallback)
 */

interface CryptoContext {
  crAg?: boolean | string;
  suspectedCryptococcalMeningitis?: boolean;
  csfOpeningPressure?: number;
  eGFR?: number;
  liposomalAvailable?: boolean;
}

@Injectable()
export class CryptococcalInductionStrategy implements CdsRuleStrategy {
  readonly type = 'cryptococcal-induction';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CryptoContext;
    const crAgPositive = ctx.crAg === true || String(ctx.crAg).toLowerCase() === 'positive';
    if (!crAgPositive && ctx.suspectedCryptococcalMeningitis !== true) return [];

    const indicator: CdsIndicator = 'critical';
    const fallback = ctx.liposomalAvailable === false;

    const regimen = fallback
      ? 'Fallback (liposomal unavailable): amphotericin B deoxycholate 1 mg/kg/day IV + flucytosine 100 mg/kg/day (in 4 divided doses) ' +
        'for 7 days, THEN fluconazole 1200 mg/day for 7 days — followed by consolidation fluconazole 800 mg/day for 8 weeks and ' +
        'secondary prophylaxis 200 mg/day. Pre-hydrate with 1 L 0.9% saline + KCl before each amphotericin dose.'
      : 'WHO-preferred (AMBITION): SINGLE high dose liposomal amphotericin B 10 mg/kg IV on day 1, PLUS flucytosine 100 mg/kg/day ' +
        '(4 divided doses) for 14 days, PLUS fluconazole 1200 mg/day for 14 days — followed by consolidation fluconazole 800 mg/day ' +
        'for 8 weeks and secondary prophylaxis 200 mg/day.';

    const pressureNote =
      typeof ctx.csfOpeningPressure === 'number' && ctx.csfOpeningPressure >= 25
        ? `CSF opening pressure ${ctx.csfOpeningPressure} cmH₂O is raised → perform therapeutic LP daily, draining to a closing ` +
          'pressure < 20 cmH₂O or by ~50%, until pressure normalises (a major driver of mortality).'
        : 'Measure and manage raised intracranial pressure with therapeutic lumbar punctures if opening pressure ≥ 25 cmH₂O.';

    const monitoring =
      'Monitor: electrolytes (K⁺/Mg²⁺) and creatinine (amphotericin nephrotoxicity), and FBC twice-weekly (flucytosine marrow ' +
      'toxicity — dose-reduce in renal impairment). Defer ART start by 4–6 weeks (IRIS risk). Pre-emptive screening: treat ' +
      'asymptomatic CrAg-positive without meningitis with fluconazole pre-emptive therapy.';

    const ref = rule.references[0] ?? {
      label: 'WHO Guidelines for diagnosing, preventing and managing cryptococcal disease (2022)',
      url: 'https://www.who.int/publications/i/item/9789240052178',
    };
    const detail = `CrAg-positive HIV patient with meningitis. ${regimen} ${pressureNote} ${monitoring}`;

    const { summary, detail: outDetailDefault } = {
      summary: 'Cryptococcal meningitis — start induction antifungal therapy now',
      detail,
    };
    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, {
      summary,
      detail: outDetailDefault,
    });

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
