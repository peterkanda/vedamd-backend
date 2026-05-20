import { describe, expect, it } from 'vitest';
import { AncPphRiskScreenStrategy } from '../src/modules/cds/strategies/anc-pph-risk-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'anc-pph-risk-screen',
  hook: 'patient-view',
  type: 'anc-pph-risk-screen',
  services: ['vedamd-anc-pph-risk-screen'],
  title: '...',
  description: '...',
  references: [
    {
      label: 'WHO Recommendations on Postpartum Haemorrhage (2022)',
      url: 'https://www.who.int/publications/i/item/9789240062498',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AncPphRiskScreenStrategy', () => {
  const s = new AncPphRiskScreenStrategy();

  it('does not fire when not pregnant', async () => {
    expect(await s.evaluate(RULE, req({ pregnant: false, gestationalAgeWeeks: 28 }))).toEqual([]);
  });

  it('does not fire below 20 weeks', async () => {
    expect(
      await s.evaluate(RULE, req({ pregnant: true, gestationalAgeWeeks: 16, previousPph: true })),
    ).toEqual([]);
  });

  it('no risk factors → info routine', async () => {
    const cards = await s.evaluate(RULE, req({ pregnant: true, gestationalAgeWeeks: 24 }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/routine/i);
  });

  it('one moderate risk factor (anaemia) → moderate warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 28, severeAnaemia: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/moderate/);
  });

  it('previous PPH alone (+2) → high-risk critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 32, previousPph: true }),
    );
    expect(cards[0].summary).toMatch(/score 2/);
    expect(cards[0].indicator).toBe('warning'); // 2 is moderate
  });

  it('previous PPH + severe anaemia → high critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 30, previousPph: true, severeAnaemia: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/score 3/);
    expect(cards[0].detail).toMatch(/CEmONC|cross-matched blood/);
  });

  it('placenta praevia + multiple pregnancy → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 30,
        placentaPraeviaOrAccreta: true,
        multiplePregnancy: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/score 3/);
  });

  it('grand multiparity threshold — parity 4 does not count, parity 5 does', async () => {
    const noScore = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 28, parity: 4 }),
    );
    const withScore = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 28, parity: 5 }),
    );
    expect(noScore[0].indicator).toBe('info');
    expect(withScore[0].indicator).toBe('warning');
  });
});
