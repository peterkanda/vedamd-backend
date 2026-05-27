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
    // The first card MUST be the VERY SEVERE FEBRILE DISEASE classification.
    // The strategy may emit follow-on info / warning cards (fever fallback,
    // prevention gaps, etc.) so we no longer assert length === 1.
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/VERY SEVERE FEBRILE DISEASE/i);
    expect(cards[0].detail).toContain('vomits-everything');
    expect(cards[0].detail).toContain('lethargic-or-unconscious');
    expect(cards[0].detail).toMatch(/refer urgently/i);
  });

  it('escalates to critical on stiff neck even without an IMCI general danger sign', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 24,
        recentTemperaturesC: [38.5],
        stiffNeck: true,
      }),
    );
    const critical = cards.find((c) => c.indicator === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.summary).toMatch(/VERY SEVERE FEBRILE DISEASE/i);
    expect(critical!.detail).toContain('stiff neck');
  });

  it('emits an empirical MALARIA card for fever in a high-malaria-risk area', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [38.5],
        malariaRiskArea: 'high',
      }),
    );
    const malaria = cards.find((c) => /malaria/i.test(c.summary));
    expect(malaria).toBeDefined();
    expect(malaria!.detail).toMatch(/artemether-lumefantrine|ACT/i);
  });

  it('a positive RDT yields a CONFIRMED MALARIA card regardless of risk band', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [38.5],
        malariaRiskArea: 'none',
        rdtResult: 'positive',
      }),
    );
    const confirmed = cards.find((c) => /confirmed malaria/i.test(c.summary));
    expect(confirmed).toBeDefined();
  });

  it('emits a SEVERE COMPLICATED MEASLES card when rash + corneal clouding present', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 24,
        recentTemperaturesC: [38.5],
        generalisedRash: true,
        measlesProdrome: true,
        corneaClouding: true,
      }),
    );
    const severe = cards.find((c) => /severe complicated measles/i.test(c.summary));
    expect(severe).toBeDefined();
    expect(severe!.indicator).toBe('critical');
  });

  it('emits a PNEUMONIA card when cough + fast breathing (RR-by-age) present', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 9, // cut-off 50/min
        recentTemperaturesC: [38.5],
        cough: true,
        respiratoryRate: 55,
      }),
    );
    const pneumonia = cards.find((c) => /\bpneumonia\b/i.test(c.summary));
    expect(pneumonia).toBeDefined();
    expect(pneumonia!.indicator).toBe('warning');
  });

  it('emits a SEVERE PNEUMONIA card when cough + chest indrawing present', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 9,
        recentTemperaturesC: [38.5],
        cough: true,
        chestIndrawing: true,
      }),
    );
    const severe = cards.find((c) => /severe pneumonia/i.test(c.summary));
    expect(severe).toBeDefined();
    expect(severe!.indicator).toBe('critical');
  });

  it('emits Plan-C card for severe dehydration', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 12,
        recentTemperaturesC: [38.5],
        diarrhoea: true,
        dehydration: 'severe',
      }),
    );
    const planC = cards.find((c) => /severe dehydration/i.test(c.summary));
    expect(planC).toBeDefined();
    expect(planC!.detail).toMatch(/Ringer/i);
  });

  it('emits a SEVERE ANAEMIA card on severe palmar pallor', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [38.5],
        palmarPallor: 'severe',
      }),
    );
    const anaemia = cards.find((c) => /severe anaemia/i.test(c.summary));
    expect(anaemia).toBeDefined();
    expect(anaemia!.indicator).toBe('critical');
  });

  it('emits a SAM card when MUAC < 115 mm', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [38.5],
        muacMm: 110,
      }),
    );
    const sam = cards.find((c) => /severe acute malnutrition/i.test(c.summary));
    expect(sam).toBeDefined();
    expect(sam!.indicator).toBe('critical');
  });

  it('emits a DENGUE WARNING SIGNS card when in endemic area with warning features', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 30,
        recentTemperaturesC: [38.5],
        dengueRiskArea: true,
        bleedingSigns: true,
      }),
    );
    const dengue = cards.find((c) => /dengue with warning signs/i.test(c.summary));
    expect(dengue).toBeDefined();
  });

  it('ignores unknown danger-sign codes (still classifies VERY SEVERE if any valid sign present)', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        ageMonths: 18,
        recentTemperaturesC: [38.0],
        dangerSigns: ['totally-made-up', 'vomits-everything'],
      }),
    );
    // Strategy passes the raw dangerSigns array through to the card detail
    // for traceability; the test below only requires that the known sign is
    // present and the unknown one is NOT silently expanded into "totally
    // made up" prose.
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toContain('vomits-everything');
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
