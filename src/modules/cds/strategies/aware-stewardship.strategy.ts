import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * AWaRe antibiotic stewardship strategy.
 *
 * Fires when any proposed medication is classified Watch or Reserve
 * in the WHO AWaRe 2023 framework. The card carries:
 *   - the AWaRe category of the proposed drug
 *   - the drug's stewardship-relevant warnings (read straight from
 *     drug.warnings — the source of truth, not duplicated here)
 *   - up to three same-class Access-tier alternatives present in the
 *     formulary so the prescriber sees real-named options
 *
 * Reserve drugs raise the indicator to critical; Watch is warning.
 * Drugs without an awareCategory or classified Access are silent.
 */
@Injectable()
export class AwareStewardshipStrategy implements CdsRuleStrategy {
  readonly type = 'aware-stewardship';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const slugs = extractMedicationSlugs(req.context);
    if (slugs.length === 0) return [];

    const cards: CdsCard[] = [];
    for (const slug of slugs) {
      const drug = this.drugs.get(slug);
      if (!drug) continue;
      if (drug.awareCategory !== 'Watch' && drug.awareCategory !== 'Reserve') continue;

      const indicator = drug.awareCategory === 'Reserve' ? 'critical' : 'warning';

      // Same-class Access alternatives — match on the top-level ATC4 prefix
      // (e.g., J01M from J01MA02) so we surface relevant antibiotics, not
      // every Access-tier drug in the formulary.
      const atc4 = drug.atc[0]?.slice(0, 4);
      const alternatives = atc4
        ? this.drugs
            .list({ aware: 'Access' })
            .filter((d) => d.atc.some((c) => c.startsWith(atc4)))
            .slice(0, 3)
            .map((d) => d.inn)
        : [];

      const altLine =
        alternatives.length > 0
          ? `\n\n**Access-tier alternatives in this formulary (same ATC4 ${atc4}):** ${alternatives.join(', ')}.`
          : '';

      const warningsLine =
        drug.warnings.length > 0 ? `\n\n**Stewardship warnings.** ${drug.warnings.join(' ')}` : '';

      cards.push({
        summary: `AWaRe ${drug.awareCategory}: ${drug.inn} — review indication and alternatives`,
        detail:
          `${drug.inn} is classified **${drug.awareCategory}** in the WHO AWaRe framework. ` +
          `Use only with a confirmed indication and after considering Access-tier alternatives.${altLine}${warningsLine}`,
        indicator,
        source: {
          label: rule.references[0]?.label ?? 'WHO AWaRe Classification',
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
