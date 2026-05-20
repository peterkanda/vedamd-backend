import { describe, expect, it } from 'vitest';
import { HivPitcTriggerStrategy } from '../src/modules/cds/strategies/hiv-pitc-trigger.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'hiv-pitc-trigger',
  hook: 'patient-view',
  type: 'hiv-pitc-trigger',
  services: ['vedamd-hiv-pitc-trigger'],
  title: '...',
  description: '...',
  references: [
    {
      label: 'WHO HTS 2019',
      url: 'https://www.who.int/publications/i/item/9789241550581',
    },
  ],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('HivPitcTriggerStrategy', () => {
  const s = new HivPitcTriggerStrategy();

  it('stays silent without hivStatusUnknown sentinel', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 28, pregnant: true })),
    ).toEqual([]);
  });

  it('pregnant + unknown status → critical mandatory offer', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, hivStatusUnknown: true, pregnant: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/current pregnancy/);
  });

  it('TB suspected → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 40, hivStatusUnknown: true, suspectedOrConfirmedTb: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/TB suspected/);
  });

  it('infant of HIV-positive mother → critical (EID)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 1, hivStatusUnknown: true, infantOfHivPositiveMother: true }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('MSM → warning strong-offer', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 28, hivStatusUnknown: true, keyPopulation: 'msm' }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/men who have sex with men/);
  });

  it('serodiscordant partner → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 35, hivStatusUnknown: true, knownHivPositiveContact: true }),
    );
    expect(cards[0].indicator).toBe('warning');
  });

  it('adult never tested → routine info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 22, hivStatusUnknown: true, monthsSinceLastNegativeTest: null }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Routine HIV testing/);
  });

  it('tested 6 months ago and no risk markers → no card', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 30, hivStatusUnknown: true, monthsSinceLastNegativeTest: 6 }),
      ),
    ).toEqual([]);
  });

  it('mandatory tier overrides strong tier (no double-card)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        hivStatusUnknown: true,
        pregnant: true,
        keyPopulation: 'sex-worker',
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });
});
