import { describe, expect, it } from 'vitest';
import { PenHypertensionScreenStrategy } from '../src/modules/cds/strategies/pen-hypertension-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'pen-hypertension-screen',
  hook: 'patient-view',
  type: 'pen-hypertension-screen',
  services: ['vedamd-pen-hypertension-screen'],
  title: 'WHO PEN — suspected new hypertension at chart open',
  description: '...',
  references: [
    {
      label: 'WHO PEN — HEARTS technical package',
      url: 'https://www.who.int/publications/i/item/9789241514613',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('PenHypertensionScreenStrategy', () => {
  const strategy = new PenHypertensionScreenStrategy();

  it('fires a warning for an adult with ≥2 elevated BPs in the last 90 days', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 52,
        hasActiveHypertensionDx: false,
        recentBPmmHg: [
          { systolicMmHg: 152, diastolicMmHg: 94, daysAgo: 5 },
          { systolicMmHg: 148, diastolicMmHg: 92, daysAgo: 30 },
          { systolicMmHg: 132, diastolicMmHg: 84, daysAgo: 60 },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Suspected new hypertension/);
    expect(cards[0].detail).toContain('152/94');
    expect(cards[0].source.label).toMatch(/HEARTS/);
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe(
      'pen-hypertension-screen',
    );
  });

  it('fires on the diastolic-only path (systolic always <140)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 40,
        recentBPmmHg: [
          { systolicMmHg: 132, diastolicMmHg: 94, daysAgo: 7 },
          { systolicMmHg: 128, diastolicMmHg: 90, daysAgo: 35 },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('132/94');
  });

  it('does not fire for under-18s', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 14,
        recentBPmmHg: [
          { systolicMmHg: 160, diastolicMmHg: 100, daysAgo: 5 },
          { systolicMmHg: 158, diastolicMmHg: 98, daysAgo: 30 },
        ],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not fire if HTN is already diagnosed', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        hasActiveHypertensionDx: true,
        recentBPmmHg: [
          { systolicMmHg: 160, diastolicMmHg: 100, daysAgo: 5 },
          { systolicMmHg: 158, diastolicMmHg: 98, daysAgo: 30 },
        ],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not fire with only ONE elevated reading', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 50,
        recentBPmmHg: [
          { systolicMmHg: 152, diastolicMmHg: 94, daysAgo: 5 },
          { systolicMmHg: 128, diastolicMmHg: 80, daysAgo: 30 },
        ],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('ignores BP readings older than the 90-day lookback window', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 60,
        recentBPmmHg: [
          { systolicMmHg: 160, diastolicMmHg: 95, daysAgo: 120 },
          { systolicMmHg: 158, diastolicMmHg: 92, daysAgo: 200 },
          { systolicMmHg: 152, diastolicMmHg: 94, daysAgo: 5 },
        ],
      }),
    );
    expect(cards).toEqual([]); // only 1 reading in window
  });

  it('fires at the exact threshold (140/90)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 30,
        recentBPmmHg: [
          { systolicMmHg: 140, diastolicMmHg: 90, daysAgo: 1 },
          { systolicMmHg: 140, diastolicMmHg: 90, daysAgo: 20 },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
  });

  it('tolerates malformed entries (filters them out)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageYears: 45,
        recentBPmmHg: [
          { systolicMmHg: 152, diastolicMmHg: 94, daysAgo: 5 },
          'garbage' as unknown as object,
          { systolicMmHg: 'high', diastolicMmHg: 92, daysAgo: 10 } as unknown as object,
          { systolicMmHg: 148, diastolicMmHg: 92, daysAgo: 30 },
        ],
      }),
    );
    expect(cards).toHaveLength(1);
  });

  it('does not fire when ageYears is missing', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        recentBPmmHg: [
          { systolicMmHg: 160, diastolicMmHg: 100, daysAgo: 5 },
          { systolicMmHg: 158, diastolicMmHg: 98, daysAgo: 30 },
        ],
      }),
    );
    expect(cards).toEqual([]);
  });
});
