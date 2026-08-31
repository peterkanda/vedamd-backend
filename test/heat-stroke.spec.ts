import { describe, expect, it } from 'vitest';
import { HeatStrokeStrategy } from '../src/modules/cds/strategies/heat-stroke.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'heat-stroke',
  hook: 'patient-view',
  type: 'heat-stroke',
  services: ['vedamd-heat-stroke'],
  title: '...',
  description: '...',
  references: [{ label: 'CDC' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 't', context };
}

describe('HeatStrokeStrategy', () => {
  const s = new HeatStrokeStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25 }))).toEqual([]);
  });

  it('core temp 41 → heat stroke critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 28,
        weightKg: 70,
        coreTemperatureC: 41.2,
        cnsDysfunction: true,
        exertional: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Heat stroke/);
    expect(cards[0].detail).toMatch(/COLD-WATER IMMERSION/);
    expect(cards[0].detail).toMatch(/1400 mL/); // 20 * 70
  });

  it('classic heat stroke → evaporative cooling line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 75,
        weightKg: 60,
        coreTemperatureC: 40.5,
        cnsDysfunction: true,
        anhidrosis: true,
      }),
    );
    expect(cards[0].detail).toMatch(/evaporative cooling/);
  });

  it('core 39.5 + CNS dysfunction → heat stroke', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 60,
        coreTemperatureC: 39.5,
        cnsDysfunction: true,
      }),
    );
    expect(cards[0].summary).toMatch(/Heat stroke/);
  });

  it('rhabdomyolysis flag triggers urinary alkalinisation line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 30,
        weightKg: 75,
        coreTemperatureC: 41.0,
        cnsDysfunction: true,
        creatineKinaseIuL: 6000,
        darkUrine: true,
      }),
    );
    expect(cards[0].detail).toMatch(/urinary alkalinisation|rhabdomyolysis/i);
  });

  it('severe heat exhaustion with SBP 85 → critical admission', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 50,
        weightKg: 65,
        coreTemperatureC: 38.5,
        systolicMmHg: 85,
        persistentVomiting: true,
      }),
    );
    expect(cards[0].summary).toMatch(/Severe heat exhaustion/);
  });

  it('mild heat exhaustion → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedHeatIllness: true,
        ageYears: 30,
        coreTemperatureC: 38.2,
        ambientHeatExposure: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Heat exhaustion/);
  });

  it('exposure only → info', async () => {
    const cards = await s.evaluate(RULE, req({ suspectedHeatIllness: true, ageYears: 30 }));
    expect(cards[0].indicator).toBe('info');
  });
});
