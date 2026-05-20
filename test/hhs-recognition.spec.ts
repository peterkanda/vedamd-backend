import { describe, expect, it } from 'vitest';
import { HhsRecognitionStrategy } from '../src/modules/cds/strategies/hhs-recognition.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'hhs-recognition',
  hook: 'patient-view',
  type: 'hhs-recognition',
  services: ['vedamd-hhs-recognition'],
  title: '...',
  description: '...',
  references: [{ label: 'JBDS' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('HhsRecognitionStrategy', () => {
  const s = new HhsRecognitionStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 65, plasmaGlucoseMmolL: 35 }))).toEqual([]);
  });

  it('triad met → critical, low-rate insulin guidance, ICD coding', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        weightKg: 80,
        suspectedHhs: true,
        plasmaGlucoseMmolL: 38,
        sodiumMmolL: 150,
        bloodKetonesMmolL: 1.0,
        venousPh: 7.35,
        bicarbonateMmolL: 22,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/0\.05 U\/kg\/h/);
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'E14.0')).toBeTruthy();
    expect(codings.find((c) => c.code === '5A21')).toBeTruthy();
    expect(codings.find((c) => c.code === '421750000')).toBeTruthy();
  });

  it('severe overlay triggers ICU card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 75,
        suspectedHhs: true,
        plasmaGlucoseMmolL: 50,
        sodiumMmolL: 165,
        bloodKetonesMmolL: 0.5,
        venousPh: 7.35,
        bicarbonateMmolL: 22,
        gcs: 11,
        oxygenSatPercent: 90,
      }),
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const icu = cards.find((c) => /critical-care input/i.test(c.summary));
    expect(icu).toBeTruthy();
  });

  it('hypokalaemia withholds insulin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 68,
        suspectedHhs: true,
        plasmaGlucoseMmolL: 35,
        sodiumMmolL: 148,
        potassiumMmolL: 3.2,
        bloodKetonesMmolL: 1.0,
        venousPh: 7.35,
      }),
    );
    expect(cards[0].detail).toMatch(/Withhold insulin/i);
  });

  it('mixed HHS / DKA picture → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        suspectedHhs: true,
        plasmaGlucoseMmolL: 35,
        bloodKetonesMmolL: 5,
        sodiumMmolL: 145,
        venousPh: 7.10,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Mixed HHS \/ DKA/);
  });
});
