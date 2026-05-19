import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * Pregnancy-safety strategy.
 *
 * Reads context.pregnant (boolean) and the proposed/current
 * medications. For each medication whose drug record has
 * `pregnancy.contraindicated: true`, fires a critical card carrying
 * the drug's own pregnancy.notes narrative — the prescriber sees the
 * structured reason in the same card.
 *
 * Drugs without the structured flag are silent here; narrative-only
 * concerns ("avoid in first trimester only") stay in the drug record
 * and the prescriber consults them via /drugs/:slug.
 */
@Injectable()
export class PregnancySafetyStrategy implements CdsRuleStrategy {
  readonly type = 'pregnancy-safety';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const pregnant = readPregnant(req.context);
    if (!pregnant) return [];

    const slugs = extractMedicationSlugs(req.context);
    if (slugs.length === 0) return [];

    const cards: CdsCard[] = [];
    for (const slug of slugs) {
      const drug = this.drugs.get(slug);
      if (!drug || !drug.pregnancy.contraindicated) continue;

      cards.push({
        summary: `Pregnancy contraindication: ${drug.inn}`,
        detail: `${drug.pregnancy.notes}\n\nProposed drug: **${drug.inn}** (${drug.drugClass}).`,
        indicator: 'critical',
        source: {
          label: rule.references[0]?.label ?? 'VedaMD pregnancy-safety registry',
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

function readPregnant(context: Record<string, unknown>): boolean {
  const v = context.pregnant;
  return v === true;
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
