import { describe, expect, it } from 'vitest';
import { PenCvdRiskStrategy } from '../src/modules/cds/strategies/pen-cvd-risk.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'pen-cvd-risk',
  hook: 'patient-view',
  type: 'pen-cvd-risk',
  services: ['vedamd-pen-cvd-risk'],
  title: '...',
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

describe('PenCvdRiskStrategy', () => {
  const s = new PenCvdRiskStrategy();

  it('does not fire under 40 or over 74', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30, sex: 'male', systolicMmHg: 140 }))).toEqual(
      [],
    );
    expect(await s.evaluate(RULE, req({ ageYears: 80, sex: 'female', systolicMmHg: 140 }))).toEqual(
      [],
    );
  });

  it('established ASCVD short-circuits to very-high critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        sex: 'male',
        systolicMmHg: 130,
        knownAtheroscleroticCvd: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Very-high/);
    expect(cards[0].detail).toMatch(/secondary prevention/i);
  });

  it('45y female, SBP 135, non-smoker, no DM → low band info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 45, sex: 'female', systolicMmHg: 135, smoker: false, diabetes: false }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Low/i);
  });

  it('55y male smoker DM SBP 160 → high band warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 55, sex: 'male', systolicMmHg: 160, smoker: true, diabetes: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/High/);
    // age 5 + male 3 + sbp 10 + smoker 5 + dm 5 = 28 → high band
    expect(cards[0].detail).toMatch(/score 28/);
  });

  it('70y male smoker DM SBP 180 → very-high critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 70, sex: 'male', systolicMmHg: 180, smoker: true, diabetes: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Very-high/);
  });

  it('cholesterol input bumps score', async () => {
    const baseline = await s.evaluate(
      RULE,
      req({ ageYears: 50, sex: 'male', systolicMmHg: 145, smoker: false, diabetes: false }),
    );
    const withChol = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        sex: 'male',
        systolicMmHg: 145,
        smoker: false,
        diabetes: false,
        totalCholesterolMmolL: 7.2,
      }),
    );
    const baselineMatch = baseline[0].detail?.match(/score (\d+)/);
    const cholMatch = withChol[0].detail?.match(/score (\d+)/);
    expect(baselineMatch).not.toBeNull();
    expect(cholMatch).not.toBeNull();
    const baselineScore = Number(baselineMatch![1]);
    const cholScore = Number(cholMatch![1]);
    expect(cholScore).toBe(baselineScore + 6);
  });
});
