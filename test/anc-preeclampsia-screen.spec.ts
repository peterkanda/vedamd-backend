import { describe, expect, it } from 'vitest';
import { AncPreeclampsiaScreenStrategy } from '../src/modules/cds/strategies/anc-preeclampsia-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'anc-preeclampsia-screen',
  hook: 'patient-view',
  type: 'anc-preeclampsia-screen',
  services: ['vedamd-anc-preeclampsia-screen'],
  title: '...',
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

describe('AncPreeclampsiaScreenStrategy', () => {
  const s = new AncPreeclampsiaScreenStrategy();

  it('does not fire if not pregnant', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({
          pregnant: false,
          gestationalAgeWeeks: 28,
          recentBPmmHg: [
            { systolicMmHg: 170, diastolicMmHg: 110, daysAgo: 1 },
            { systolicMmHg: 165, diastolicMmHg: 108, daysAgo: 2 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('does not fire before 20 weeks', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({
          pregnant: true,
          gestationalAgeWeeks: 18,
          recentBPmmHg: [
            { systolicMmHg: 160, diastolicMmHg: 110, daysAgo: 1 },
            { systolicMmHg: 160, diastolicMmHg: 110, daysAgo: 2 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('SBP >=160 → severe critical, mag-sulphate guidance', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 32,
        recentBPmmHg: [{ systolicMmHg: 168, diastolicMmHg: 104, daysAgo: 1 }],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe pre-eclampsia/);
    expect(cards[0].detail).toMatch(/magnesium sulphate/);
  });

  it('Proteinuria +++ alone → severe critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 30,
        recentBPmmHg: [{ systolicMmHg: 130, diastolicMmHg: 80, daysAgo: 1 }],
        urineProteinDipstick: '+++',
      }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('Severe symptom alone → severe critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 30,
        recentBPmmHg: [{ systolicMmHg: 130, diastolicMmHg: 80, daysAgo: 1 }],
        symptoms: ['convulsions'],
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/convulsions/);
  });

  it('≥2 BPs 145/95 + proteinuria + → pre-eclampsia warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 30,
        recentBPmmHg: [
          { systolicMmHg: 145, diastolicMmHg: 95, daysAgo: 1 },
          { systolicMmHg: 148, diastolicMmHg: 92, daysAgo: 5 },
        ],
        urineProteinDipstick: '+',
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Pre-eclampsia/);
    expect(cards[0].detail).toMatch(/methyldopa|labetalol/);
  });

  it('≥2 BPs 145/95 without proteinuria → gestational hypertension', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 28,
        recentBPmmHg: [
          { systolicMmHg: 145, diastolicMmHg: 95, daysAgo: 1 },
          { systolicMmHg: 148, diastolicMmHg: 92, daysAgo: 5 },
        ],
        urineProteinDipstick: 'trace',
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Gestational hypertension/);
  });

  it('Single elevated reading without other features → no card', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({
          pregnant: true,
          gestationalAgeWeeks: 28,
          recentBPmmHg: [{ systolicMmHg: 145, diastolicMmHg: 95, daysAgo: 1 }],
        }),
      ),
    ).toEqual([]);
  });

  it('Normotensive + no symptoms → no card', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({
          pregnant: true,
          gestationalAgeWeeks: 28,
          recentBPmmHg: [{ systolicMmHg: 120, diastolicMmHg: 78, daysAgo: 1 }],
        }),
      ),
    ).toEqual([]);
  });
});
