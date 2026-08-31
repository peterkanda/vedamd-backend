import { describe, expect, it } from 'vitest';
import { MhgapPsychosisScreenStrategy } from '../src/modules/cds/strategies/mhgap-psychosis-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'mhgap-psychosis-screen',
  hook: 'patient-view',
  type: 'mhgap-psychosis-screen',
  services: ['vedamd-mhgap-psychosis-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO mhGAP IG' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('MhgapPsychosisScreenStrategy', () => {
  const s = new MhgapPsychosisScreenStrategy();

  it('does not fire under 12', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 10, psychoticFeatures: ['delusions'] }))).toEqual(
      [],
    );
  });

  it('no features and no markers → no card', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30 }))).toEqual([]);
  });

  it('no features but escalation flag → behavioural-change warning', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 30, severeAgitation: true }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/medical mimic/i);
  });

  it('features without escalation, recent onset → first-episode warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 22,
        psychoticFeatures: ['delusions', 'hallucinations'],
        onsetWeeks: 2,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/First-episode/);
    expect(cards[0].detail).toMatch(/haloperidol|olanzapine/);
  });

  it('chronic-onset features → chronic warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 32,
        psychoticFeatures: ['hallucinations'],
        onsetWeeks: 24,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Chronic psychosis/);
  });

  it('features + imminent harm → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        psychoticFeatures: ['delusions'],
        imminentHarmRiskToSelfOrOthers: true,
        onsetWeeks: 1,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/delirium/);
  });

  it('features + organic mimic (fever) → critical with rule-out-delirium line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        psychoticFeatures: ['hallucinations'],
        feverPresent: true,
        onsetWeeks: 0,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/fever/);
  });

  it('ignores unknown psychotic-feature codes', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, psychoticFeatures: ['nonsense-code'], onsetWeeks: 1 }),
    );
    expect(cards).toEqual([]);
  });
});
