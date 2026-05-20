import { describe, expect, it } from 'vitest';
import { ImciDiarrhoeaUnder5Strategy } from '../src/modules/cds/strategies/imci-diarrhoea-under5.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-diarrhoea-under5',
  hook: 'patient-view',
  type: 'imci-diarrhoea-under5',
  services: ['vedamd-imci-diarrhoea-under5'],
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

describe('ImciDiarrhoeaUnder5Strategy', () => {
  const s = new ImciDiarrhoeaUnder5Strategy();

  it('does not fire over age 5', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 72, daysOfDiarrhoea: 3, dehydrationSigns: ['sunken-eyes'] }),
    );
    expect(cards).toEqual([]);
  });

  it('no dehydration → Plan A info card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 18, daysOfDiarrhoea: 2, dehydrationSigns: [] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Plan A/);
    expect(cards[0].detail).toMatch(/zinc/);
  });

  it('two severe signs → Plan C critical card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 9,
        daysOfDiarrhoea: 4,
        dehydrationSigns: ['lethargic-or-unconscious', 'sunken-eyes'],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Plan C/);
    expect(cards[0].detail).toMatch(/IV fluids/);
  });

  it('two "some" signs → Plan B warning card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 24,
        daysOfDiarrhoea: 3,
        dehydrationSigns: ['restless-or-irritable', 'drinks-eagerly-thirsty'],
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Plan B/);
    expect(cards[0].detail).toMatch(/75 mL\/kg/);
  });

  it('persistent diarrhoea (>=14d) adds a second card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 30, daysOfDiarrhoea: 18, dehydrationSigns: [] }),
    );
    expect(cards.map((c) => c.summary)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Plan A/),
        expect.stringMatching(/Persistent/),
      ]),
    );
  });

  it('blood in stool adds a dysentery card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 30, daysOfDiarrhoea: 3, bloodInStool: true, dehydrationSigns: [] }),
    );
    expect(cards.find((c) => /Dysentery/.test(c.summary))).toBeTruthy();
  });

  it('ignores unknown sign codes', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageMonths: 24, daysOfDiarrhoea: 2, dehydrationSigns: ['not-a-real-sign'] }),
    );
    expect(cards[0].indicator).toBe('info'); // no recognised signs → no dehydration
  });
});
