import { describe, expect, it } from 'vitest';
import { PaediatricDosingStrategy } from '../src/modules/cds/strategies/paediatric-dosing.strategy';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';
import { makeKnowledgeService } from './helpers/knowledge';

const RULE: CdsRule = {
  id: 'paediatric-dosing',
  hook: 'medication-prescribe',
  type: 'paediatric-dosing',
  services: ['vedamd-paediatric-dosing'],
  title: 'Paediatric dose calculator with renal + weight safety checks',
  description: '...',
  references: [{ label: 'WHO Model Formulary for Children 2010' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function makeStrategy(): PaediatricDosingStrategy {
  const knowledge = makeKnowledgeService();
  const drugs = new DrugsService(knowledge);
  drugs.onModuleInit();
  return new PaediatricDosingStrategy(drugs);
}

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'medication-prescribe', hookInstance: 'test', context };
}

describe('PaediatricDosingStrategy', () => {
  it('returns an info card with calculated paracetamol dose for a 12 kg child', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({
        childWeightKg: 12,
        childAgeYears: 2,
        proposedMedications: ['paracetamol'],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/paracetamol/i);
    // 12 kg * 15 mg/kg = 180 mg/dose
    expect(cards[0].detail).toContain('180 mg');
    expect(cards[0].detail).toContain('12 kg');
    expect(cards[0].detail).toContain('age 2 y');
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe(
      'paediatric-dosing',
    );
  });

  it('does NOT fire without a child weight', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ proposedMedications: ['paracetamol'] }),
    );
    expect(cards).toEqual([]);
  });

  it('does NOT fire at adult weight (>=50 kg)', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 55, proposedMedications: ['paracetamol'] }),
    );
    expect(cards).toEqual([]);
  });

  it('silently ignores unknown drug slugs', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 12, proposedMedications: ['unobtanium'] }),
    );
    expect(cards).toEqual([]);
  });

  it('reads from proposed / medications fields as alternatives', async () => {
    const cards1 = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 12, proposed: ['paracetamol'] }),
    );
    const cards2 = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 12, medications: ['paracetamol'] }),
    );
    expect(cards1.length).toBe(1);
    expect(cards2.length).toBe(1);
  });

  it('emits one card per distinct proposed drug', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({
        childWeightKg: 12,
        proposedMedications: ['paracetamol', 'amoxicillin', 'paracetamol'],
      }),
    );
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((c) => c.summary.toLowerCase().includes('paracetamol'))).size).toBe(2);
  });

  it('escalates to critical when no paediatric protocol exists', async () => {
    // atorvastatin has no paediatric dosing block — calculator returns
    // not-applicable, which the strategy surfaces as critical.
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 10, proposedMedications: ['atorvastatin'] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/atorvastatin/i);
    expect(cards[0].summary).toMatch(/unsafe to calculate/i);
  });

  it('escalates to critical for individualised regimens (warfarin)', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 20, proposedMedications: ['warfarin'] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });

  it('returns no card when proposedMedications is empty', async () => {
    const cards = await makeStrategy().evaluate(
      RULE,
      req({ childWeightKg: 12, proposedMedications: [] }),
    );
    expect(cards).toEqual([]);
  });
});
