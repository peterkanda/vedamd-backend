import { describe, expect, it } from 'vitest';
import { CageAidSubstanceScreenStrategy } from '../src/modules/cds/strategies/cage-aid-substance-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'cage-aid-substance-screen',
  hook: 'patient-view',
  type: 'cage-aid-substance-screen',
  services: ['vedamd-cage-aid-substance-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO mhGAP IG' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('CageAidSubstanceScreenStrategy', () => {
  const s = new CageAidSubstanceScreenStrategy();

  it('does not fire under 12', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 10, cageAidResponses: [true, true, true, true] })),
    ).toEqual([]);
  });

  it('info when wrong-length array', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 30, cageAidResponses: [true, true] }));
    expect(cards[0].summary).toMatch(/four CAGE-AID/i);
  });

  it('0/4 → negative screen info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, cageAidResponses: [false, false, false, false] }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/0\/4/);
  });

  it('1/4 → motivational counselling info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, cageAidResponses: [true, false, false, false] }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/1\/4/);
  });

  it('2/4 → positive warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, cageAidResponses: [true, true, false, false] }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/positive \(2\/4\)/);
    expect(cards[0].detail).toMatch(/FRAMES/);
  });

  it('acute-risk flag → 2 cards (critical first, screen second)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        cageAidResponses: [true, true, true, true],
        recentOverdose: true,
      }),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/overdose/);
    expect(cards[1].indicator).toBe('warning');
  });

  it('withdrawal signs alone trigger the critical card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 35,
        cageAidResponses: [false, false, false, false],
        withdrawalSigns: true,
      }),
    );
    expect(cards.find((c) => c.indicator === 'critical')).toBeTruthy();
  });
});
