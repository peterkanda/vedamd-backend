import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import { AllergyService } from '../../allergy/allergy.service';
import { matchDrugAllergies } from '../../drugs/allergy-matching';
import type { DrugRecord } from '../../drugs/drugs.types';
import type { CrossReactivityRisk } from '../../allergy/allergy.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import type { CdsRuleStrategy } from './types';
import { extractMedicationSlugs } from './medication-slugs';

const RISK_TO_INDICATOR: Record<CrossReactivityRisk, CdsIndicator> = {
  high: 'critical',
  moderate: 'warning',
  low: 'info',
  negligible: 'info',
};

/**
 * Drug allergy / cross-reactivity strategy.
 *
 * Reads context.allergies (patient-declared allergen strings) and the
 * proposed/current medications. Flags a proposed drug that either matches
 * a declared allergen directly (same slug/INN/trade name — catches drugs
 * with no cross-reactivity bundle entry at all) or falls in a class with
 * known cross-reactivity to a declared allergen (e.g. penicillin allergy +
 * amoxicillin/cephalosporin order), via the VedaMD allergy cross-reactivity
 * registry. Deterministic; the same matcher backs the REST safety-review
 * panel (DrugsService.safetyReview), so the two surfaces can't disagree.
 */
@Injectable()
export class DrugAllergyCrossReactivityStrategy implements CdsRuleStrategy {
  readonly type = 'drug-allergy-cross-reactivity';

  constructor(
    private readonly drugs: DrugsService,
    private readonly allergy: AllergyService,
  ) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const allergens = extractAllergens(req.context);
    if (allergens.length === 0) return [];

    const slugs = extractMedicationSlugs(req.context);
    if (slugs.length === 0) return [];

    const resolved = slugs.map((s) => this.drugs.get(s)).filter((d): d is DrugRecord => !!d);
    if (resolved.length === 0) return [];

    const flags = matchDrugAllergies(resolved, allergens, this.allergy.allFull());

    return flags.map((f): CdsCard => {
      const indicator = RISK_TO_INDICATOR[f.risk] ?? 'warning';
      const detail =
        f.matchType === 'direct-drug-match'
          ? f.recommendation
          : `**Mechanism.** ${f.mechanism}\n\n**Recommendation.** ${f.recommendation}`;
      return {
        summary: `Allergy risk: ${f.drug} — declared allergen "${f.allergen}"`,
        detail,
        indicator,
        source: {
          label: rule.references[0]?.label ?? 'VedaMD allergy cross-reactivity registry',
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

function extractAllergens(context: Record<string, unknown>): string[] {
  const v = context.allergies;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
