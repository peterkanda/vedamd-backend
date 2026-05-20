import { describe, expect, it } from 'vitest';
import { SyphilisScreenStrategy } from '../src/modules/cds/strategies/syphilis-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'syphilis-screen',
  hook: 'patient-view',
  type: 'syphilis-screen',
  services: ['vedamd-syphilis-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO STI 2021' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('SyphilisScreenStrategy', () => {
  const s = new SyphilisScreenStrategy();

  it('no context → no card', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30 }))).toEqual([]);
  });

  it('pregnant + screen not done → critical antenatal offer', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, pregnant: true, syphilisScreenStatus: 'not-done' }),
    );
    expect(cards.find((c) => /Antenatal syphilis screen/i.test(c.summary))).toBeTruthy();
  });

  it('pregnant + screen done → no antenatal-offer card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, pregnant: true, syphilisScreenStatus: 'done' }),
    );
    expect(cards.find((c) => /Antenatal syphilis screen/i.test(c.summary))).toBeFalsy();
  });

  it('positive + untreated early disease → critical single-dose penicillin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        syphilisTestPositive: true,
        earlyVsLate: 'early',
      }),
    );
    const treatment = cards.find((c) => /single-dose benzathine/i.test(c.summary));
    expect(treatment).toBeTruthy();
    expect(treatment!.detail).toMatch(/2\.4 MU IM/);
  });

  it('positive + late stage → 3-week regimen', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        syphilisTestPositive: true,
        earlyVsLate: 'late',
      }),
    );
    const treatment = cards.find((c) => /Late.*syphilis/i.test(c.summary));
    expect(treatment).toBeTruthy();
    expect(treatment!.detail).toMatch(/3 consecutive weeks/);
  });

  it('positive + neurosyphilis → IV penicillin 10–14 days', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 45,
        syphilisTestPositive: true,
        suspectedNeurosyphilis: true,
      }),
    );
    expect(cards[0].detail).toMatch(/10–14 days|aqueous crystalline/);
  });

  it('positive + pregnancy + penicillin allergy → desensitisation line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 27,
        pregnant: true,
        syphilisTestPositive: true,
        earlyVsLate: 'early',
        penicillinAllergy: true,
      }),
    );
    const treatment = cards.find((c) => /benzathine/i.test(c.summary));
    expect(treatment!.detail).toMatch(/desensitisation/i);
  });

  it('targeted offer (key population) without prior screen → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        keyPopulation: 'msm',
        syphilisScreenStatus: 'not-done',
      }),
    );
    expect(cards.find((c) => c.indicator === 'warning')).toBeTruthy();
  });

  it('positive AND pregnant fires BOTH treatment AND antenatal-offer when screen not done', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        pregnant: true,
        syphilisScreenStatus: 'not-done',
        syphilisTestPositive: true,
        earlyVsLate: 'early',
      }),
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
