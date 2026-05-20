import { describe, expect, it } from 'vitest';
import { PenDiabetesScreenStrategy } from '../src/modules/cds/strategies/pen-diabetes-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'pen-diabetes-screen',
  hook: 'patient-view',
  type: 'pen-diabetes-screen',
  services: ['vedamd-pen-diabetes-screen'],
  title: 'WHO PEN — suspected new diabetes at chart open',
  description: '...',
  references: [
    {
      label: 'WHO PEN — Package of essential NCD interventions (2020)',
      url: 'https://example.invalid/pen',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('PenDiabetesScreenStrategy', () => {
  const strategy = new PenDiabetesScreenStrategy();

  it('fires on fasting glucose ≥7.0 mmol/L', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 55,
        recentGlucoseMmolL: [{ valueMmolL: 8.2, fasting: true, daysAgo: 10 }],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Suspected new diabetes/);
    expect(cards[0].detail).toContain('fasting plasma glucose 8.2');
  });

  it('fires on random glucose ≥11.1 mmol/L', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 35,
        recentGlucoseMmolL: [{ valueMmolL: 14.5, fasting: false, daysAgo: 3 }],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('random plasma glucose 14.5');
  });

  it('fires on HbA1c ≥6.5%', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 48,
        recentHbA1cPercent: [{ value: 7.2, daysAgo: 30 }],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('HbA1c 7.2');
  });

  it('combines all three triggers in one detail line', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 60,
        recentGlucoseMmolL: [
          { valueMmolL: 8.0, fasting: true, daysAgo: 5 },
          { valueMmolL: 13.5, fasting: false, daysAgo: 5 },
        ],
        recentHbA1cPercent: [{ value: 7.0, daysAgo: 10 }],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('fasting plasma glucose 8.0');
    expect(cards[0].detail).toContain('random plasma glucose 13.5');
    expect(cards[0].detail).toContain('HbA1c 7.0');
  });

  it('does not fire on fasting <7.0 OR random <11.1 OR hba1c <6.5', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        recentGlucoseMmolL: [
          { valueMmolL: 6.8, fasting: true, daysAgo: 5 },
          { valueMmolL: 10.0, fasting: false, daysAgo: 5 },
        ],
        recentHbA1cPercent: [{ value: 6.0, daysAgo: 5 }],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not double-count: random reading 9.0 is NOT a trigger even if fasting threshold is 7.0', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        recentGlucoseMmolL: [{ valueMmolL: 9.0, fasting: false, daysAgo: 5 }],
      }),
    );
    expect(cards).toEqual([]); // fasting threshold doesn't apply to non-fasting reading
  });

  it('does not fire for under-18s', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 16,
        recentGlucoseMmolL: [{ valueMmolL: 13.0, fasting: false, daysAgo: 1 }],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not fire when diabetes is already diagnosed', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 55,
        hasActiveDiabetesDx: true,
        recentGlucoseMmolL: [{ valueMmolL: 16.0, fasting: false, daysAgo: 1 }],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('ignores readings outside the 180-day lookback window', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        recentGlucoseMmolL: [{ valueMmolL: 15.0, fasting: false, daysAgo: 250 }],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('tolerates malformed glucose/hba1c entries', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        recentGlucoseMmolL: [
          'garbage' as unknown as object,
          { valueMmolL: 'high', fasting: false, daysAgo: 5 } as unknown as object,
          { valueMmolL: 13.0, fasting: false, daysAgo: 5 },
        ],
        recentHbA1cPercent: [
          { value: 'high', daysAgo: 5 } as unknown as object,
          { value: 7.5, daysAgo: 10 },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('13.0');
    expect(cards[0].detail).toContain('7.5');
  });

  it('does not fire when ageYears is missing', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        recentGlucoseMmolL: [{ valueMmolL: 13.0, fasting: false, daysAgo: 1 }],
      }),
    );
    expect(cards).toEqual([]);
  });
});
