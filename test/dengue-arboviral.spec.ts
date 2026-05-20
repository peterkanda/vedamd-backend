import { describe, expect, it } from 'vitest';
import { DengueArboviralStrategy } from '../src/modules/cds/strategies/dengue-arboviral.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'dengue-arboviral',
  hook: 'patient-view',
  type: 'dengue-arboviral',
  services: ['vedamd-dengue-arboviral'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO Dengue' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 't', context };
}

describe('DengueArboviralStrategy', () => {
  const s = new DengueArboviralStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25 }))).toEqual([]);
  });

  it('severe dengue (narrow pulse pressure) → critical Group C bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedArboviralFever: true,
        ageYears: 25,
        weightKg: 60,
        systolicMmHg: 100,
        diastolicMmHg: 85,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe dengue|Group C/);
    expect(cards[0].detail).toMatch(/1200 mL/); // 20 * 60
  });

  it('Group B warning signs → critical admission', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedArboviralFever: true,
        ageYears: 30,
        weightKg: 70,
        abdominalPainOrTenderness: true,
        persistentVomiting: true,
        plateletCount: 50,
        priorPlateletCount: 200,
      }),
    );
    expect(cards[0].summary).toMatch(/warning signs|Group B/i);
    expect(cards[0].detail).toMatch(/5–7 mL\/kg\/h/);
  });

  it('Zika in pregnancy → urgent maternal-foetal referral', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedArboviralFever: true,
        suspectedZika: true,
        pregnant: true,
        ageYears: 28,
        daysOfFever: 2,
      }),
    );
    expect(cards[0].detail).toMatch(/microcephaly|maternal-foetal/i);
  });

  it('uncomplicated arboviral fever → warning, NO NSAIDs', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedArboviralFever: true,
        ageYears: 35,
        daysOfFever: 2,
        rashPresent: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/NO aspirin|NO NSAIDs|never NSAIDs/);
  });

  it('cards carry ICD-10 + ICD-11 + SNOMED codings', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedArboviralFever: true,
        ageYears: 25,
        weightKg: 60,
        systolicMmHg: 100,
        diastolicMmHg: 85,
      }),
    );
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'A90')).toBeTruthy();
    expect(codings.find((c) => c.code === '1D2Z')).toBeTruthy();
    expect(codings.find((c) => c.code === '38362002')).toBeTruthy();
  });
});
