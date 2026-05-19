import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * Renal-safety strategy.
 *
 * Reads context.crClMlMin and the proposed/current medications. For
 * each medication whose drug record carries a renal-adjustment band
 * matching the supplied CrCl AND marked `prohibited: true`, fire a
 * critical card. Drugs without a matching band, or matching a
 * non-prohibited band, are silent.
 */
@Injectable()
export class RenalSafetyStrategy implements CdsRuleStrategy {
  readonly type = 'renal-safety';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const crCl = readCrCl(req.context);
    if (crCl === undefined) return [];

    const slugs = extractMedicationSlugs(req.context);
    if (slugs.length === 0) return [];

    const cards: CdsCard[] = [];
    for (const slug of slugs) {
      const drug = this.drugs.get(slug);
      if (!drug) continue;
      const bands = drug.dosing.renal ?? [];
      const hit = bands.find((b) => {
        const okLower = b.crClMinMlMin === undefined || crCl >= b.crClMinMlMin;
        const okUpper = b.crClMaxMlMin === undefined || crCl < b.crClMaxMlMin;
        return okLower && okUpper;
      });
      if (!hit || !hit.prohibited) continue;

      cards.push({
        summary: `Renal contraindication: ${drug.inn} at CrCl ${crCl} mL/min`,
        detail: `${hit.adjustment}\n\nProposed drug: **${drug.inn}** (${drug.drugClass}).`,
        indicator: 'critical',
        source: {
          label: rule.references[0]?.label ?? 'VedaMD renal-safety registry',
          url: rule.references[0]?.url,
        },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
    return cards;
  }
}

function readCrCl(context: Record<string, unknown>): number | undefined {
  const keys = ['crClMlMin', 'crCl', 'creatinineClearance'];
  for (const k of keys) {
    const v = context[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return undefined;
}

function extractMedicationSlugs(context: Record<string, unknown>): string[] {
  const fields = ['medications', 'proposed', 'current', 'draftMedications', 'currentMedications'];
  const out: string[] = [];
  for (const f of fields) {
    const v = context[f];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') out.push(item);
      }
    }
  }
  return out;
}
