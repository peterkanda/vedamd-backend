import { describe, expect, it } from 'vitest';
import { ImciFeverUnder5Strategy } from '../src/modules/cds/strategies/imci-fever-under5.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-fever-under5',
  hook: 'patient-view',
  type: 'imci-fever-under5',
  services: ['vedamd-imci-fever-under5'],
  title: 'IMCI fever assessment in children under 5',
  description: '...',
  references: [
    { label: 'WHO IMCI Chartbook 2014', url: 'https://apps.who.int/iris/handle/10665/104772' },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test-instance', context };
}

describe('ImciFeverUnder5Strategy', () => {
  const strategy = new ImciFeverUnder5Strategy();

  it('fires a warning card for a 23-month-old with temp ≥37.5 °C, no danger signs', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 23,
        recentTemperaturesC: [37.2, 38.1, 37.0],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Suspected febrile illness/);
    expect(cards[0].detail).toContain('38.1');
    expect(cards[0].source.label).toBe('WHO IMCI Chartbook 2014');
    expect(cards[0].source.url).toContain('apps.who.int');
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe(
      'imci-fever-under5',
    );
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].evidenceLevel).toBe('A');
  });

  it('escalates to critical when an IMCI general danger sign is reported', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 12,
        recentTemperaturesC: [38.5],
        dangerSigns: ['vomits-everything', 'lethargic-or-unconscious'],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe febrile illness/);
    expect(cards[0].detail).toContain('vomits everything');
    expect(cards[0].detail).toContain('lethargic or unconscious');
    expect(cards[0].detail).toContain('refer urgently');
  });

  it('ignores unknown danger-sign codes', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 18,
        recentTemperaturesC: [38.0],
        dangerSigns: ['totally-made-up', 'vomits-everything'],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toContain('vomits everything');
    expect(cards[0].detail).not.toContain('totally-made-up');
  });

  it('does not fire for children ≥5 years old', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 72,
        recentTemperaturesC: [39.0, 40.1],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not fire when all temperatures are below 37.5 °C', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 24,
        recentTemperaturesC: [36.8, 37.4, 37.0],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('does not fire when no temperatures are supplied', async () => {
    const cards = await strategy.evaluate(RULE, req({ ageMonths: 24, recentTemperaturesC: [] }));
    expect(cards).toEqual([]);
  });

  it('does not fire when ageMonths is missing', async () => {
    const cards = await strategy.evaluate(RULE, req({ recentTemperaturesC: [38.5] }));
    expect(cards).toEqual([]);
  });

  it('tolerates malformed temperatures (filters non-numbers)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: ['38.5' as unknown as number, null as unknown as number, 38.2, NaN],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('38.2');
  });

  it('fires at the exact 37.5 °C threshold', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 12,
        recentTemperaturesC: [37.5],
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('37.5');
  });

  it('does NOT fire for a child at the upper edge (60 months)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 60,
        recentTemperaturesC: [38.5],
      }),
    );
    expect(cards).toEqual([]);
  });

  it('reports the maximum temperature, not the first', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [37.6, 39.4, 37.8],
      }),
    );
    expect(cards[0].detail).toContain('39.4');
  });
});
