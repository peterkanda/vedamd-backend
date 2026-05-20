import { describe, expect, it } from 'vitest';
import { ImciMalnutritionUnder5Strategy } from '../src/modules/cds/strategies/imci-malnutrition-under5.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-malnutrition-under5',
  hook: 'patient-view',
  type: 'imci-malnutrition-under5',
  services: ['vedamd-imci-malnutrition-under5'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO IMCI Chartbook 2014' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('ImciMalnutritionUnder5Strategy', () => {
  const s = new ImciMalnutritionUnder5Strategy();

  it('over 5 years → no card', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 72, muacMm: 110 }))).toEqual([]);
  });

  it('infant <6 mo → info redirect to infant pathway', async () => {
    const cards = await s.evaluate(RULE, req({ ageMonths: 3, muacMm: 100 }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Infant/);
  });

  it('no anthropometry → info "measure MUAC"', async () => {
    const cards = await s.evaluate(RULE, req({ ageMonths: 24 }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Measure MUAC/i);
  });

  it('MUAC < 11.5 cm with IMCI danger sign → complicated SAM critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 30,
        muacMm: 108,
        appetiteTestPass: false,
        dangerSigns: ['lethargic-or-unconscious'],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Complicated SAM/);
    expect(cards[0].detail).toMatch(/F-75/);
  });

  it('MUAC < 11.5 cm, no complications, appetite passes → uncomplicated SAM → OTP warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, muacMm: 110, appetiteTestPass: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Uncomplicated SAM/);
    expect(cards[0].detail).toMatch(/RUTF/);
  });

  it('bilateral pitting oedema alone → SAM (regardless of MUAC)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 30, muacMm: 130, bilateralPittingOedema: true, appetiteTestPass: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/SAM/);
  });

  it('MUAC 12.0 cm → MAM warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 36, muacMm: 120, appetiteTestPass: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Moderate acute malnutrition/);
    expect(cards[0].detail).toMatch(/SFP/);
  });

  it('MUAC 130 mm, no oedema → no acute malnutrition info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, muacMm: 130, appetiteTestPass: true }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/No acute malnutrition/);
  });
});
