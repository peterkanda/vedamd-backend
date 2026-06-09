import { describe, expect, it } from 'vitest';
import { HepaticSafetyStrategy } from '../src/modules/cds/strategies/hepatic-safety.strategy';
import type { HepaticDoseService } from '../src/modules/hepatic-dose/hepatic-dose.service';
import type { HepaticDoseRecord } from '../src/modules/hepatic-dose/hepatic-dose.types';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'hepatic-safety',
  hook: 'medication-prescribe',
  type: 'hepatic-safety',
  title: 'Hepatic-function safety check',
  description: '...',
  references: [{ label: 'WHO Model Formulary — hepatic impairment' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'expert-consensus',
};

const PARACETAMOL: HepaticDoseRecord = {
  slug: 'paracetamol-hepatic',
  drugSlug: 'paracetamol',
  drug: 'Paracetamol',
  oneLiner:
    'MAX 2 g/day in cirrhosis — first-line analgesic but dose-restricted. AVOID in acute liver failure.',
  worstClassDecision: 'reduce-dose',
  domains: ['analgesia'],
  mechanism: 'Glucuronidation; NAPQI accumulation in cirrhosis.',
  guidance: [
    { class: 'A', adjustment: 'Reduce to max 2-3 g/day.' },
    {
      class: 'B',
      adjustment: 'Max 2 g/day; preferred over NSAIDs.',
      notes: 'Monitor LFTs at baseline and 1 week.',
    },
    { class: 'C', adjustment: 'Max 2 g/day with caution.' },
  ],
  monitoring: 'Baseline LFTs; repeat at 1 week.',
  acuteFailureGuidance: 'AVOID — additional paracetamol load worsens injury.',
  alternatives: ['topical NSAID for local pain'],
  references: [{ label: 'Lewis JH, Stine JG 2013', strength: 'B' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'B',
};

const hepatic = {
  getByDrugSlug: (slug: string) => (slug.toLowerCase() === 'paracetamol' ? PARACETAMOL : null),
} as unknown as HepaticDoseService;

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'medication-prescribe', hookInstance: 't', context };
}

describe('HepaticSafetyStrategy', () => {
  const s = new HepaticSafetyStrategy(hepatic);

  it('silent without an impairment signal', async () => {
    expect(await s.evaluate(RULE, req({ medications: ['paracetamol'] }))).toEqual([]);
  });

  it('silent when impaired but no medications', async () => {
    expect(await s.evaluate(RULE, req({ childPughClass: 'B' }))).toEqual([]);
  });

  it('silent for a drug without a hepatic-dose record', async () => {
    expect(
      await s.evaluate(RULE, req({ childPughClass: 'B', medications: ['amoxicillin'] })),
    ).toEqual([]);
  });

  it('Child-Pugh B → warning card with the class-specific guidance + monitoring', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ childPughClass: 'B', medications: ['paracetamol'] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning'); // worstClassDecision: reduce-dose
    expect(cards[0].summary).toMatch(/Paracetamol \(Child-Pugh B\)/);
    expect(cards[0].detail).toMatch(/Max 2 g\/day; preferred over NSAIDs/);
    expect(cards[0].detail).toMatch(/Monitor LFTs/);
    expect(cards[0].detail).toMatch(/Baseline LFTs/);
  });

  it('acute liver failure → critical card with the acute-failure guidance', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ acuteLiverFailure: true, medications: ['paracetamol'] }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/acute liver failure/);
    expect(cards[0].detail).toMatch(/AVOID — additional paracetamol load/);
  });

  it('cirrhosis boolean with no class → falls back to the headline', async () => {
    const cards = await s.evaluate(RULE, req({ cirrhosis: true, current: ['paracetamol'] }));
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toMatch(/MAX 2 g\/day in cirrhosis/);
  });
});
