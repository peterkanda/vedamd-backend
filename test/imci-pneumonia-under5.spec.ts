import { describe, expect, it } from 'vitest';
import { ImciPneumoniaUnder5Strategy } from '../src/modules/cds/strategies/imci-pneumonia-under5.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-pneumonia-under5',
  hook: 'patient-view',
  type: 'imci-pneumonia-under5',
  services: ['vedamd-imci-pneumonia-under5'],
  title: '...',
  description: '...',
  references: [
    { label: 'WHO IMCI Chartbook 2014', url: 'https://apps.who.int/iris/handle/10665/104772' },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('ImciPneumoniaUnder5Strategy', () => {
  const s = new ImciPneumoniaUnder5Strategy();

  it('does not fire over age 5', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 72, respiratoryRatePerMin: 60 }))).toEqual([]);
  });

  it('does not fire for neonates under 2 months (different protocol)', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 1, respiratoryRatePerMin: 60 }))).toEqual([]);
  });

  it('chest indrawing → severe pneumonia critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 18, respiratoryRatePerMin: 35, chestIndrawing: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe pneumonia/);
    expect(cards[0].detail).toMatch(/ampicillin|ceftriaxone/);
  });

  it('SpO2 < 90 → severe pneumonia critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, respiratoryRatePerMin: 30, oxygenSatPercent: 88 }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/88%/);
  });

  it('fast breathing >=50/min in 6-month-old → pneumonia warning + oral amoxicillin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 6, respiratoryRatePerMin: 55, chestIndrawing: false }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Pneumonia/);
    expect(cards[0].detail).toMatch(/amoxicillin/);
    expect(cards[0].detail).toMatch(/55\/min/);
    expect(cards[0].detail).toMatch(/≥ 50 for age/);
  });

  it('RR 45 in a 36-month-old crosses the 40 threshold → pneumonia warning', async () => {
    const cards = await s.evaluate(RULE, req({ ageMonths: 36, respiratoryRatePerMin: 45 }));
    expect(cards[0].indicator).toBe('warning');
  });

  it('RR 39 in a 36-month-old → no pneumonia info', async () => {
    const cards = await s.evaluate(RULE, req({ ageMonths: 36, respiratoryRatePerMin: 39 }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/No pneumonia/);
  });

  it('general danger sign + normal RR still escalates', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, respiratoryRatePerMin: 30, generalDangerSign: true }),
    );
    expect(cards[0].indicator).toBe('critical');
  });
});
