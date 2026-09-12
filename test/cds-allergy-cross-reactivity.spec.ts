import { describe, expect, it } from 'vitest';
import { DrugAllergyCrossReactivityStrategy } from '../src/modules/cds/strategies/drug-allergy-cross-reactivity.strategy';
import type { DrugsService } from '../src/modules/drugs/drugs.service';
import type { AllergyService } from '../src/modules/allergy/allergy.service';
import type { AllergyCrossReactivity } from '../src/modules/allergy/allergy.types';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';

/**
 * Unit-tests the strategy directly against a fake DrugsService/AllergyService
 * rather than the full bundle-driven CdsService pipeline (no bundle rule
 * entry / re-signing required for this test — see plan Fix 2 for the
 * bundle-side wiring, gated on a signing-key permission).
 */

const drugBySlug: Record<string, DrugRecord> = {
  amoxicillin: { slug: 'amoxicillin', inn: 'Amoxicillin', tradeNames: [] } as unknown as DrugRecord,
  ciprofloxacin: {
    slug: 'ciprofloxacin',
    inn: 'Ciprofloxacin',
    tradeNames: [],
  } as unknown as DrugRecord,
};

const allergyRecords: AllergyCrossReactivity[] = [
  {
    slug: 'penicillin-cephalosporin',
    allergen: 'Penicillins',
    crossReactsWith: 'Cephalosporins',
    risk: 'high',
    mechanism: 'Shared beta-lactam ring.',
    recommendation: 'Choose a structurally distinct class or use with extreme caution.',
    drugSlugs: ['amoxicillin', 'ceftriaxone'],
    domains: ['allergy'],
    references: [],
  } as unknown as AllergyCrossReactivity,
];

function makeStrategy(): DrugAllergyCrossReactivityStrategy {
  const drugs = { get: (slug: string) => drugBySlug[slug] ?? null } as unknown as DrugsService;
  const allergy = { allFull: () => allergyRecords } as unknown as AllergyService;
  return new DrugAllergyCrossReactivityStrategy(drugs, allergy);
}

const rule: CdsRule = {
  id: 'drug-allergy-cross-reactivity-check',
  hook: 'medication-prescribe',
  type: 'drug-allergy-cross-reactivity',
  title: 'Drug allergy / cross-reactivity safety check',
  description: '',
  references: [{ label: 'Allergy/immunology consensus', strength: 'C' }],
  ruleVersion: '0.1.0-placeholder',
  reviewStatus: 'draft',
  evidenceLevel: 'expert-consensus',
} as unknown as CdsRule;

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'medication-prescribe', hookInstance: 'x', context };
}

describe('DrugAllergyCrossReactivityStrategy', () => {
  it('fires a critical card when a penicillin-allergic patient is prescribed amoxicillin', async () => {
    const cards = await makeStrategy().evaluate(
      rule,
      req({ allergies: ['penicillins'], medications: ['amoxicillin'] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toContain('Amoxicillin');
  });

  it('does not fire when no allergies are declared', async () => {
    const cards = await makeStrategy().evaluate(rule, req({ medications: ['amoxicillin'] }));
    expect(cards).toHaveLength(0);
  });

  it('does not fire when the proposed drug has no cross-reactivity or direct match', async () => {
    const cards = await makeStrategy().evaluate(
      rule,
      req({ allergies: ['penicillins'], medications: ['ciprofloxacin'] }),
    );
    expect(cards).toHaveLength(0);
  });

  it('fires a direct-match card when the allergen names the drug itself', async () => {
    const cards = await makeStrategy().evaluate(
      rule,
      req({ allergies: ['ciprofloxacin'], medications: ['ciprofloxacin'] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });
});
