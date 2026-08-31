import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * HIV first-line ART recommendation — WHO 2024. TLD (TDF + 3TC + DTG)
 * is the preferred first-line for adults and adolescents ≥ 30 kg.
 * Two deterministic safety overlays: rifampicin co-treatment needs
 * supplementary dolutegravir, and HBV co-infection mandates a
 * tenofovir-containing backbone.
 *
 * Anonymous-by-design. Reads only:
 *   context.hivStatus 'positive' | context.newArtInitiation boolean (sentinel)
 *   context.weightKg number (≥30 kg → adult TLD)
 *   context.coMedications string[] (rifampicin overlap detection)
 *   context.hbsag boolean | 'positive' (HBV co-infection)
 */

interface ArtContext {
  hivStatus?: string;
  newArtInitiation?: boolean;
  weightKg?: number;
  coMedications?: unknown;
  hbsag?: boolean | string;
}

@Injectable()
export class HivArtFirstLineStrategy implements CdsRuleStrategy {
  readonly type = 'hiv-art-first-line';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ArtContext;
    const positive = ctx.hivStatus?.toLowerCase() === 'positive' || ctx.newArtInitiation === true;
    if (!positive) return [];

    const coMeds = Array.isArray(ctx.coMedications)
      ? (ctx.coMedications as unknown[]).map((m) => String(m).toLowerCase())
      : [];
    const onRifampicin = coMeds.some((m) => m.includes('rifampicin') || m.includes('rifampin'));
    const hbv = ctx.hbsag === true || String(ctx.hbsag).toLowerCase() === 'positive';
    const underWeight = typeof ctx.weightKg === 'number' && ctx.weightKg < 30;

    const notes: string[] = [];
    let indicator: CdsIndicator = 'info';

    let summary = 'HIV ART — start TLD (TDF + 3TC + DTG) first-line';
    let recommendation =
      'WHO-preferred first-line for adults and adolescents ≥ 30 kg: TLD — tenofovir DF 300 mg + lamivudine 300 mg + dolutegravir 50 mg, ' +
      'ONE tablet once daily. Same-day start is encouraged once ready; do baseline creatinine/eGFR, screen for TB and cryptococcal ' +
      'disease (CD4 where available), and give CTX prophylaxis per criteria.';

    if (underWeight) {
      indicator = 'warning';
      summary = 'HIV ART — patient < 30 kg: use weight-band paediatric regimen, not adult TLD';
      notes.push(
        'Weight < 30 kg → adult TLD is NOT appropriate; use the WHO weight-band paediatric DTG-based regimen (pDTG dispersible) ' +
          'and dose by weight band.',
      );
    }

    if (onRifampicin) {
      indicator = 'warning';
      notes.push(
        'Rifampicin co-treatment (TB) induces dolutegravir → give an EXTRA dolutegravir 50 mg approximately 12 h after the TLD ' +
          'dose for the duration of rifampicin and for ~2 weeks after stopping it.',
      );
    }

    if (hbv) {
      if (indicator === 'info') indicator = 'warning';
      notes.push(
        'HBsAg-positive (HBV co-infection) → a tenofovir-containing backbone is essential; do NOT use a regimen without tenofovir ' +
          'and do not interrupt it abruptly (hepatitis flare risk). Monitor LFTs.',
      );
    }

    const ref = rule.references[0] ?? {
      label: 'WHO Consolidated HIV Guidelines (2024)',
      url: 'https://www.who.int/publications/i/item/9789240031593',
    };
    const detail = `${recommendation}${notes.length ? ' ' + notes.join(' ') : ''}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, {
      summary,
      detail,
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
