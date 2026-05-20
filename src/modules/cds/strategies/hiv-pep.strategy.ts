import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * HIV post-exposure prophylaxis (PEP) — WHO 2024 / CDC. PEP must start
 * as soon as possible and within 72 h of exposure; benefit falls
 * sharply with delay. The deterministic gate is the 72-hour window and
 * the source's HIV status.
 *
 * Anonymous-by-design. Reads only:
 *   context.exposureType 'occupational' | 'sexual' | 'mtct' | string (sentinel)
 *   context.suspectedHivExposure boolean (alternative sentinel)
 *   context.hoursSinceExposure number (>72 → outside window)
 *   context.sourceHivStatus 'positive' | 'negative' | 'unknown'
 *   context.eGFR number (renal regimen adjustment)
 */

const WINDOW_HOURS = 72;

interface PepContext {
  exposureType?: string;
  suspectedHivExposure?: boolean;
  hoursSinceExposure?: number;
  sourceHivStatus?: string;
  eGFR?: number;
}

@Injectable()
export class HivPepStrategy implements CdsRuleStrategy {
  readonly type = 'hiv-pep';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PepContext;
    if (!ctx.exposureType && ctx.suspectedHivExposure !== true) return [];

    const hours = ctx.hoursSinceExposure;
    const source = ctx.sourceHivStatus?.toLowerCase();
    const lowEgfr = typeof ctx.eGFR === 'number' && ctx.eGFR < 50;

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    const regimen = lowEgfr
      ? 'Renal impairment (eGFR < 50) → avoid TDF: use a TAF- or abacavir-based backbone (e.g. ABC/3TC if HLA-B*5701 negative) + ' +
        'DTG 50 mg once daily, or seek specialist advice for dose-adjusted alternatives.'
      : 'Tenofovir DF + lamivudine (or emtricitabine) + dolutegravir 50 mg, ONE tablet once daily for 28 days (TLD-equivalent PEP).';

    if (source === 'negative') {
      indicator = 'info';
      summary = 'HIV PEP — source confirmed HIV-negative: PEP not indicated';
      recommendation =
        'Source is confirmed HIV-negative and not in a window period → PEP is not indicated. Provide reassurance, baseline ' +
        'testing if clinically appropriate, and counsel on future risk reduction (consider PrEP for ongoing exposure).';
    } else if (typeof hours === 'number' && hours > WINDOW_HOURS) {
      indicator = 'warning';
      summary = `HIV PEP — ${hours} h since exposure (> 72 h): outside the PEP window`;
      recommendation =
        'Exposure was more than 72 h ago → PEP is no longer recommended (efficacy lost). Do baseline HIV testing, arrange ' +
        'follow-up testing at 6 weeks and 3 months, and counsel on PrEP for any ongoing risk. Treat as a new infection workup if symptomatic.';
    } else {
      indicator = 'critical';
      summary = 'HIV PEP — start prophylaxis NOW (within 72 h window)';
      recommendation =
        `Start PEP as soon as possible (ideally within hours, no later than 72 h). ${regimen} Test the source where possible and ` +
        'do baseline HIV (and HBV/HCV, pregnancy, STI) testing on the exposed person. Repeat HIV testing at 6 weeks and 3 months. ' +
        'Stop PEP if the source is confirmed HIV-negative. Provide adherence support, manage nausea, and add HBV/STI prophylaxis and ' +
        'emergency contraception as indicated.';
    }

    const ref = rule.references[0] ?? {
      label: 'WHO HIV post-exposure prophylaxis guidelines (2024)',
      url: 'https://stacks.cdc.gov/view/cdc/38856',
    };
    const detail = `Exposure type: ${ctx.exposureType ?? 'unspecified'}${typeof hours === 'number' ? `, ${hours} h ago` : ''}. ${recommendation}`;

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
