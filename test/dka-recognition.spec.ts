import { describe, expect, it } from 'vitest';
import { DkaRecognitionStrategy } from '../src/modules/cds/strategies/dka-recognition.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'dka-recognition',
  hook: 'patient-view',
  type: 'dka-recognition',
  services: ['vedamd-dka-recognition'],
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

describe('DkaRecognitionStrategy', () => {
  const s = new DkaRecognitionStrategy();

  it('silent without suspectedDka', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25, plasmaGlucoseMmolL: 28 }))).toEqual([]);
  });

  it('full triad → critical with bundle + weighted insulin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 22,
        weightKg: 70,
        suspectedDka: true,
        plasmaGlucoseMmolL: 28,
        venousPh: 7.2,
        bicarbonateMmolL: 12,
        bloodKetonesMmolL: 4.5,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    // 0.1 U/kg/h × 70 kg = 7 U/h
    expect(cards[0].detail).toMatch(/7 U\/h/);
  });

  it('severe DKA (pH 6.9 + shock) → 2 critical cards', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 22,
        weightKg: 60,
        suspectedDka: true,
        plasmaGlucoseMmolL: 30,
        venousPh: 6.9,
        bicarbonateMmolL: 4,
        bloodKetonesMmolL: 7,
        systolicMmHg: 85,
      }),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[1].indicator).toBe('critical');
    expect(cards[1].summary).toMatch(/Severe DKA/);
  });

  it('K < 3.5 escalates and flags hold-insulin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedDka: true,
        plasmaGlucoseMmolL: 25,
        venousPh: 7.25,
        bicarbonateMmolL: 13,
        bloodKetonesMmolL: 5,
        potassiumMmolL: 3.0,
      }),
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.find((c) => /hold insulin/i.test(c.detail ?? ''))).toBeTruthy();
  });

  it('partial triad (hyper + acidosis, no ketones) → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        suspectedDka: true,
        plasmaGlucoseMmolL: 22,
        venousPh: 7.2,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Partial/);
  });

  it('isolated hyperglycaemia → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        suspectedDka: true,
        plasmaGlucoseMmolL: 16,
        venousPh: 7.4,
        bicarbonateMmolL: 24,
        bloodKetonesMmolL: 0.4,
      }),
    );
    expect(cards[0].indicator).toBe('info');
  });
});
