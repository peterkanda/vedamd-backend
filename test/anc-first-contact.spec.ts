import { describe, expect, it } from 'vitest';
import { AncFirstContactStrategy } from '../src/modules/cds/strategies/anc-first-contact.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'anc-first-contact',
  hook: 'patient-view',
  type: 'anc-first-contact',
  services: ['vedamd-anc-first-contact'],
  title: 'WHO ANC SMART Guideline — first antenatal-contact screen',
  description: '...',
  references: [
    {
      label: 'WHO ANC SMART Guideline (2016)',
      url: 'https://www.who.int/publications/i/item/9789241549912',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AncFirstContactStrategy', () => {
  const strategy = new AncFirstContactStrategy();

  it('does not fire for a non-pregnant patient', async () => {
    const cards = await strategy.evaluate(RULE, req({ pregnant: false, firstAncContact: true }));
    expect(cards).toEqual([]);
  });

  it('does not fire if firstAncContact is false', async () => {
    const cards = await strategy.evaluate(RULE, req({ pregnant: true, firstAncContact: false }));
    expect(cards).toEqual([]);
  });

  it('emits a single info checklist card for a routine first contact at 8 weeks', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({ pregnant: true, firstAncContact: true, gestationalAgeWeeks: 8 }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/first-contact checklist/i);
    expect(cards[0].detail).toMatch(/folic acid/);
    expect(cards[0].detail).toMatch(/LLIN/);
  });

  it('omits the LLIN line when malariaEndemic is explicitly false', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 10,
        malariaEndemic: false,
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).not.toMatch(/LLIN/);
  });

  it('emits warning + info for a late booking (>12 weeks) with no danger signs', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({ pregnant: true, firstAncContact: true, gestationalAgeWeeks: 18 }),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/late booking/i);
    expect(cards[0].detail).toContain('18 weeks');
    expect(cards[1].indicator).toBe('info');
  });

  it('emits a CRITICAL danger-sign card and suppresses the checklist when a danger sign is present', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 28,
        dangerSigns: ['severe-vaginal-bleeding'],
      }),
    );
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/refer urgently/i);
    expect(cards[0].detail).toContain('severe vaginal bleeding');
    expect(cards.find((c) => c.indicator === 'info')).toBeUndefined();
  });

  it('emits critical + late-booking warning when both apply', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 22,
        dangerSigns: ['convulsions'],
      }),
    );
    expect(cards.length).toBe(2);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[1].indicator).toBe('warning');
    expect(cards.find((c) => c.indicator === 'info')).toBeUndefined();
  });

  it('combines multiple danger signs into one critical card', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 28,
        dangerSigns: ['severe-headache', 'blurred-vision'],
      }),
    );
    const crit = cards.filter((c) => c.indicator === 'critical');
    expect(crit).toHaveLength(1);
    expect(crit[0].detail).toContain('severe persistent headache');
    expect(crit[0].detail).toContain('blurred vision');
  });

  it('ignores unknown danger-sign codes', async () => {
    const cards = await strategy.evaluate(
      RULE,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 10,
        dangerSigns: ['totally-made-up'],
      }),
    );
    // Unknown codes are filtered, so behaviour is "no danger signs":
    // a single info card.
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('info');
  });

  // v0.1 limitation: localeMessages is rule-wide, not per-card. A
  // single sw entry overrides the summary/detail templates for every
  // card a rule emits. Multi-card rules like ANC therefore need
  // separate per-card locale tables in a future schema bump
  // (e.g. localeMessages.sw.cards[<cardKey>]). For now we just verify
  // that the override fires when `context.lang` is set and a
  // matching block exists.
  it('uses the Swahili override when context.lang=sw and localeMessages.sw is provided', async () => {
    const rule: CdsRule = {
      ...RULE,
      localeMessages: {
        sw: {
          summary: 'Dalili hatari ya ANC — peleka mama haraka',
          detail: 'Dalili au ujumbe: {{labels}}{{weeks}}{{endemicLine}}.',
        },
      },
    };
    const cards = await new AncFirstContactStrategy().evaluate(
      rule,
      req({
        pregnant: true,
        firstAncContact: true,
        gestationalAgeWeeks: 8,
        lang: 'sw',
      }),
    );
    expect(cards).toHaveLength(1); // info card only — no danger sign, not late booking
    expect(cards[0].summary).toMatch(/peleka mama haraka/);
  });
});
