import { describe, expect, it } from 'vitest';
import { TbSymptomScreenStrategy } from '../src/modules/cds/strategies/tb-symptom-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'tb-symptom-screen',
  hook: 'patient-view',
  type: 'tb-symptom-screen',
  services: ['vedamd-tb-symptom-screen'],
  title: '...',
  description: '...',
  references: [
    {
      label: 'WHO Consolidated Guidelines on TB (2021)',
      url: 'https://www.who.int/publications/i/item/9789240013131',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('TbSymptomScreenStrategy', () => {
  const s = new TbSymptomScreenStrategy();

  it('cough <14 days in general population → no card', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30, coughDays: 5 }))).toEqual([]);
  });

  it('cough >=14 days in general population → warning + Xpert recommendation', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 35, coughDays: 21 }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/TB symptom screen positive/i);
    expect(cards[0].detail).toMatch(/Xpert/);
  });

  it('two risk markers without long cough → fires', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 45,
        coughDays: 3,
        weightLossUnintentional: true,
        nightSweatsDrenching: true,
      }),
    );
    expect(cards).toHaveLength(1);
  });

  it('only one risk marker without long cough → no card', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 45, coughDays: 3, weightLossUnintentional: true })),
    ).toEqual([]);
  });

  it('PLHIV with one symptom → fires (four-symptom rule)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        coughDays: 4,
        knownHivPositive: true,
      }),
    );
    expect(cards[0].detail).toMatch(/PLHIV/);
    expect(cards[0].detail).toMatch(/co-trimoxazole/);
  });

  it('HIV status unknown → adds offer-PITC line', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 40, coughDays: 20 }));
    expect(cards[0].detail).toMatch(/provider-initiated HIV testing/i);
  });

  it('HIV known-negative → no PITC offer line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 40, coughDays: 20, knownHivPositive: false }),
    );
    expect(cards[0].detail).not.toMatch(/provider-initiated HIV testing/i);
  });

  it('does not fire without ageYears', async () => {
    expect(await s.evaluate(RULE, req({ coughDays: 30 }))).toEqual([]);
  });
});
