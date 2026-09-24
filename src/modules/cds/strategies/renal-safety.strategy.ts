import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import { matchRenal } from '../../drugs/drugs.dosing';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import type { CdsRuleStrategy } from './types';
import { extractMedicationSlugs } from './medication-slugs';

/**
 * Renal-safety strategy.
 *
 * Reads context.crClMlMin and the proposed/current medications. For
 * each medication whose drug record carries a renal-adjustment band
 * matching the supplied CrCl: a `prohibited` band fires a critical card,
 * a `caution` band (qualified avoidance) a warning. Dose-adjustment-only
 * bands are left to the dosing calculator. Band matching is shared with
 * the calculator (matchRenal) so the two never disagree.
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
      const hit = matchRenal(drug.dosing.renal, crCl);
      if (!hit || (!hit.prohibited && !hit.caution)) continue;

      cards.push({
        summary: hit.prohibited
          ? `Renal contraindication: ${drug.inn} at CrCl ${crCl} mL/min`
          : `Renal caution: ${drug.inn} at CrCl ${crCl} mL/min`,
        detail: `${hit.adjustment}\n\nProposed drug: **${drug.inn}** (${drug.drugClass}).`,
        indicator: hit.prohibited ? 'critical' : 'warning',
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
