import { describe, expect, it } from 'vitest';
import { AdultAcsRecognitionStrategy } from '../src/modules/cds/strategies/adult-acs-recognition.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'adult-acs-recognition',
  hook: 'patient-view',
  type: 'adult-acs-recognition',
  services: ['vedamd-adult-acs-recognition'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO PEN HEARTS' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AdultAcsRecognitionStrategy', () => {
  const s = new AdultAcsRecognitionStrategy();

  it('silent without suspectedAcs', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 60, painOngoingMin: 30 })),
    ).toEqual([]);
  });

  it('does not fire for paediatric patients', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 12, suspectedAcs: true })),
    ).toEqual([]);
  });

  it('STEMI pattern → critical bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 60,
        suspectedAcs: true,
        painOngoingMin: 30,
        typicalFeatures: ['chest-pressure-or-tightness'],
        stElevationReported: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/aspirin 300/);
    expect(cards[0].detail).toMatch(/clopidogrel/);
  });

  it('haemodynamic instability alone → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        suspectedAcs: true,
        painOngoingMin: 10,
        systolicMmHg: 80,
        typicalFeatures: [],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('hypoxia SpO2<90 → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 55,
        suspectedAcs: true,
        painOngoingMin: 30,
        typicalFeatures: ['chest-pressure-or-tightness'],
        oxygenSatPercent: 85,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('typical features w/o ongoing pain → warning, ECG within 10 min', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 55,
        suspectedAcs: true,
        painOngoingMin: 0,
        typicalFeatures: ['chest-pressure-or-tightness', 'radiation-to-arm-or-jaw'],
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/ECG within 10/);
  });

  it('atypical with ≥2 risk factors → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        suspectedAcs: true,
        riskFactors: ['smoker', 'dm', 'htn'],
      }),
    );
    expect(cards[0].indicator).toBe('warning');
  });

  it('low-risk → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        suspectedAcs: true,
        typicalFeatures: [],
        riskFactors: [],
      }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Low-risk/);
  });
});
