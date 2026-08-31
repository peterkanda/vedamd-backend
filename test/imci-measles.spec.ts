import { describe, expect, it } from 'vitest';
import { ImciMeaslesStrategy } from '../src/modules/cds/strategies/imci-measles.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-measles',
  hook: 'patient-view',
  type: 'imci-measles',
  services: ['vedamd-imci-measles'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO IMCI' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('ImciMeaslesStrategy', () => {
  const s = new ImciMeaslesStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 24 }))).toEqual([]);
  });

  it('silent for child ≥ 60 months (out of IMCI band)', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 72, suspectedMeasles: true }))).toEqual([]);
  });

  it('severe complicated → critical with age-banded vitamin A', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 15,
        suspectedMeasles: true,
        measlesRashPresent: true,
        generalDangerSign: true,
        pneumoniaSevere: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe complicated/);
    expect(cards[0].detail).toMatch(/200 000 IU/);
    expect(cards[0].detail).toMatch(/ceftriaxone/i);
  });

  it('corneal clouding triggers eye-ointment line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 30,
        suspectedMeasles: true,
        measlesRashPresent: true,
        cornealClouding: true,
      }),
    );
    expect(cards[0].detail).toMatch(/Tetracycline 1 % eye ointment/);
  });

  it('infant < 6 months gets 50 000 IU vitamin A', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 4,
        suspectedMeasles: true,
        measlesRashPresent: true,
        pneumoniaNonSevere: true,
      }),
    );
    expect(cards[0].detail).toMatch(/50 000 IU/);
  });

  it('uncomplicated rash → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 36,
        suspectedMeasles: true,
        measlesRashPresent: true,
        cough: true,
        coryza: true,
        conjunctivitis: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Uncomplicated measles/);
  });

  it('Koplik spots without rash → info prodrome', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 30,
        suspectedMeasles: true,
        koplikSpots: true,
      }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/prodrome/i);
  });
});
