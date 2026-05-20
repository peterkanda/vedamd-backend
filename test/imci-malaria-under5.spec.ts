import { describe, expect, it } from 'vitest';
import { ImciMalariaUnder5Strategy } from '../src/modules/cds/strategies/imci-malaria-under5.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-malaria-under5',
  hook: 'patient-view',
  type: 'imci-malaria-under5',
  services: ['vedamd-imci-malaria-under5'],
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

describe('ImciMalariaUnder5Strategy', () => {
  const s = new ImciMalariaUnder5Strategy();

  it('stays silent without malariaContextProvided sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 18, rdtPositive: true }))).toEqual([]);
  });

  it('does not fire over age 5', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageMonths: 72, malariaContextProvided: true, rdtPositive: true }),
      ),
    ).toEqual([]);
  });

  it('RDT-positive + no severe features → uncomplicated AL warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, malariaContextProvided: true, rdtPositive: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Uncomplicated malaria/);
    expect(cards[0].detail).toMatch(/artemether-lumefantrine|AL/);
  });

  it('RDT-negative → info, no antimalarial', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, malariaContextProvided: true, rdtPositive: false }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/RDT negative/);
  });

  it('IMCI danger sign → severe malaria critical with pre-referral artesunate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 18,
        malariaContextProvided: true,
        rdtPositive: true,
        dangerSigns: ['lethargic-or-unconscious'],
        weightKg: 10,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe malaria/);
    // 3 mg/kg × 10 kg = 30 mg pre-referral artesunate
    expect(cards[0].detail).toMatch(/30 mg/);
  });

  it('severe anaemia sign alone → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 30, malariaContextProvided: true, rdtPositive: false, severeAnaemiaSign: true }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('impaired consciousness without RDT result → critical (treat empirically)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 36, malariaContextProvided: true, impairedConsciousness: true }),
    );
    expect(cards[0].indicator).toBe('critical');
  });
});
