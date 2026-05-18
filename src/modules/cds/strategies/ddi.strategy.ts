import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { InteractionSeverity } from '../../drugs/drugs.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import type { CdsRuleStrategy } from './types';

const SEVERITY_TO_INDICATOR: Record<InteractionSeverity, CdsIndicator> = {
  severe: 'critical',
  major: 'critical',
  moderate: 'warning',
  minor: 'info',
};

/**
 * Drug-drug interaction strategy.
 *
 * Reads the proposed and current medications from the CDS Hooks
 * payload, looks them up against the bundle's interactions table,
 * and returns one card per known pairwise interaction. Severity maps
 * to the CDS Hooks card indicator.
 *
 * Accepted payload shapes (all opaque JSON — never FHIR-parsed):
 *   context.medications:     ["paracetamol", "warfarin"]
 *   context.proposed:        ["paracetamol"]
 *   context.current:         ["warfarin"]
 *   context.draftMedications:["paracetamol"]
 *   context.currentMedications:["warfarin"]
 *
 * Slug, RxNorm, or any other identifier is accepted as a string;
 * non-slug values that don't resolve are silently ignored.
 */
@Injectable()
export class DrugDrugInteractionStrategy implements CdsRuleStrategy {
  readonly type = 'drug-drug-interaction';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const slugs = extractMedicationSlugs(req.context);
    if (slugs.length < 2) return [];

    const { interactions } = this.drugs.checkInteractions(slugs);
    if (interactions.length === 0) return [];

    return interactions.map((i): CdsCard => {
      const indicator = SEVERITY_TO_INDICATOR[i.severity];
      return {
        summary: `${i.severity.toUpperCase()} interaction: ${i.slugA} ↔ ${i.slugB}`,
        detail: `**Mechanism.** ${i.mechanism}\n\n**Management.** ${i.management}`,
        indicator,
        source: {
          label: rule.references[0]?.label ?? 'VedaMD interaction registry',
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
      };
    });
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
