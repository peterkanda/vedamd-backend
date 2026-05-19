import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { CdsCard, CdsHookRequest } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * Medication monitoring reminder for patient-view.
 *
 * On chart open, surfaces an info card for every current medication
 * whose drug record carries a non-empty `monitoring` array. The card
 * lists the monitoring items verbatim — they are short, structured
 * clinical reminders sourced from the WHO Model Formulary and KEML.
 *
 * Reads context.currentMedications, then medications, then current.
 * Returns nothing for drugs with no monitoring list (e.g. paracetamol),
 * for unknown slugs, or when no medications are supplied.
 */
@Injectable()
export class MedicationMonitoringStrategy implements CdsRuleStrategy {
  readonly type = 'medication-monitoring';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const slugs = extractCurrentMedicationSlugs(req.context);
    if (slugs.length === 0) return [];

    const seen = new Set<string>();
    const cards: CdsCard[] = [];
    for (const slug of slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);

      const drug = this.drugs.get(slug);
      if (!drug || drug.monitoring.length === 0) continue;

      cards.push({
        summary: `Monitoring reminder: ${drug.inn}`,
        detail:
          `Active medication ${drug.inn} (${drug.drugClass}) requires:\n` +
          drug.monitoring.map((m) => `  - ${m}`).join('\n'),
        indicator: 'info',
        source: {
          label: rule.references[0]?.label ?? 'VedaMD drug record monitoring',
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

function extractCurrentMedicationSlugs(context: Record<string, unknown>): string[] {
  const fields = ['currentMedications', 'medications', 'current'];
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
