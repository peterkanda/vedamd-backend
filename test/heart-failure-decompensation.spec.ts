import { describe, expect, it } from 'vitest';
import { HeartFailureDecompensationStrategy } from '../src/modules/cds/strategies/heart-failure-decompensation.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'heart-failure-decompensation',
  hook: 'patient-view',
  type: 'heart-failure-decompensation',
  services: ['vedamd-heart-failure-decompensation'],
  title: '...',
  description: '...',
  references: [{ label: 'ESC' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('HeartFailureDecompensationStrategy', () => {
  const s = new HeartFailureDecompensationStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 60 }))).toEqual([]);
  });

  it('silent in children', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 10, suspectedHeartFailureDecompensation: true }),
      ),
    ).toEqual([]);
  });

  it('cardiogenic shock features → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        suspectedHeartFailureDecompensation: true,
        systolicMmHg: 80,
        hypoperfusionSigns: true,
        pulmonaryOedemaPinkFrothy: true,
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/shock/i);
    expect(cards[0].detail).toMatch(/noradrenaline/);
  });

  it('RV-infarct flag suppresses nitrate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        suspectedHeartFailureDecompensation: true,
        oxygenSatPercent: 85,
        knownRvInfarct: true,
      }),
    );
    expect(cards[0].detail).toMatch(/AVOID nitrates/);
  });

  it('decompensation triad → critical with GDMT for HFrEF', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        suspectedHeartFailureDecompensation: true,
        orthopnoeaOrPnd: true,
        bilateralBasalCrackles: true,
        recentWeightGainKg: 3,
        jvpRaised: true,
        knownEjectionFractionPercent: 30,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/decompensation/i);
    expect(cards[0].detail).toMatch(/SGLT2/);
  });

  it('hyperkalaemia in HFrEF withholds ACE/MRA', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        suspectedHeartFailureDecompensation: true,
        orthopnoeaOrPnd: true,
        bilateralBasalCrackles: true,
        knownEjectionFractionPercent: 25,
        potassiumMmolL: 5.8,
      }),
    );
    expect(cards[0].detail).toMatch(/withhold/i);
  });

  it('mild oedema only → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 60,
        suspectedHeartFailureDecompensation: true,
        peripheralOedema: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
  });

  it('no decompensation features → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 60, suspectedHeartFailureDecompensation: true }),
    );
    expect(cards[0].indicator).toBe('info');
  });
});
