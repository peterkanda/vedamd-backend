import { describe, expect, it } from 'vitest';
import { AdultMalariaStrategy } from '../src/modules/cds/strategies/adult-malaria.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'adult-malaria',
  hook: 'patient-view',
  type: 'adult-malaria',
  services: ['vedamd-adult-malaria'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO Malaria Guidelines 2023' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AdultMalariaStrategy', () => {
  const s = new AdultMalariaStrategy();

  it('silent without malariaContextProvided', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25, rdtPositive: true }))).toEqual([]);
  });

  it('does not fire under age 12', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 8, malariaContextProvided: true, rdtPositive: true }),
      ),
    ).toEqual([]);
  });

  it('RDT-negative → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, malariaContextProvided: true, rdtPositive: false }),
    );
    expect(cards[0].indicator).toBe('info');
  });

  it('RDT-positive uncomplicated → warning, AL with food', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, malariaContextProvided: true, rdtPositive: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/WITH FOOD/i);
  });

  it('impaired consciousness → critical with auto-computed artesunate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        weightKg: 60,
        malariaContextProvided: true,
        rdtPositive: true,
        impairedConsciousness: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    // 2.4 mg/kg × 60 kg = 144 mg
    expect(cards[0].detail).toMatch(/144 mg/);
  });

  it('Hb < 7 → critical (severe anaemia)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        malariaContextProvided: true,
        rdtPositive: true,
        haemoglobinGdl: 5.8,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/severe anaemia/);
  });

  it('pregnancy 1st-trimester overlay', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 27,
        malariaContextProvided: true,
        rdtPositive: true,
        pregnant: true,
        pregnancyTrimester: 1,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/Pregnancy 1st trimester/);
  });

  it('G6PD overlay flags primaquine contraindication', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        malariaContextProvided: true,
        rdtPositive: true,
        knownG6pdDeficient: true,
      }),
    );
    expect(cards[0].detail).toMatch(/primaquine/i);
  });
});
