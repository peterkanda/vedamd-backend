import { describe, expect, it } from 'vitest';
import { Phq9DepressionScreenStrategy } from '../src/modules/cds/strategies/phq9-depression-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'phq9-depression-screen',
  hook: 'patient-view',
  type: 'phq9-depression-screen',
  services: ['vedamd-phq9-depression-screen'],
  title: '...',
  description: '...',
  references: [
    {
      label: 'WHO mhGAP Intervention Guide (2.0)',
      url: 'https://www.who.int/publications/i/item/9789241549790',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('Phq9DepressionScreenStrategy', () => {
  const s = new Phq9DepressionScreenStrategy();

  it('does not fire under age 12', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 8, phq9Responses: [0, 0, 0, 0, 0, 0, 0, 0, 0] })),
    ).toEqual([]);
  });

  it('returns INFO when fewer than 9 responses are provided', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 25, phq9Responses: [1, 1, 1] }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/nine PHQ-9 responses/i);
  });

  it('rejects out-of-range responses', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, phq9Responses: [0, 0, 0, 0, 0, 0, 0, 0, 5] }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/integers 0\.\.3/);
  });

  it('score 3 → minimal info, no item-9 → 1 card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, phq9Responses: [1, 1, 1, 0, 0, 0, 0, 0, 0] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/PHQ-9 3 \(minimal\)/);
  });

  it('score 12 → moderate warning, no item 9 → 1 card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, phq9Responses: [2, 2, 1, 1, 1, 1, 2, 2, 0] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/moderate/);
  });

  it('score 22 → severe critical, no item 9 → 1 card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, phq9Responses: [3, 3, 3, 3, 2, 2, 2, 2, 2] }),
    );
    // Item 9 = 2 so we expect 2 cards (severe + suicide gate).
    expect(cards).toHaveLength(2);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/severe/);
    expect(cards[1].indicator).toBe('critical');
    expect(cards[1].summary).toMatch(/item 9 positive/i);
  });

  it('any item 9 >=1 fires the suicide-risk gate even when total is mild', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, phq9Responses: [0, 0, 0, 0, 0, 0, 0, 0, 1] }),
    );
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => /item 9 positive/i.test(c.summary))).toBeTruthy();
  });

  it('item 9 = 0 → no suicide-risk gate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, phq9Responses: [3, 3, 3, 3, 2, 2, 2, 2, 0] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });
});
