import { describe, expect, it } from 'vitest';
import { PostpartumCareStrategy } from '../src/modules/cds/strategies/postpartum-care.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'postpartum-care',
  hook: 'patient-view',
  type: 'postpartum-care',
  services: ['vedamd-postpartum-care'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO PNC' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('PostpartumCareStrategy', () => {
  const s = new PostpartumCareStrategy();

  it('silent outside the 6-week window', async () => {
    expect(await s.evaluate(RULE, req({ postpartumDays: 60 }))).toEqual([]);
  });

  it('silent without any postpartum context', async () => {
    expect(await s.evaluate(RULE, req({}))).toEqual([]);
  });

  it('heavy bleeding → critical, PPH bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ postpartumDays: 1, heavyBleeding: true, firstPncDone: true }),
    );
    const red = cards.find((c) => c.indicator === 'critical');
    expect(red).toBeTruthy();
    expect(red!.detail).toMatch(/tranexamic acid/i);
  });

  it('postpartum severe-range hypertension → critical eclampsia bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        postpartumDays: 4,
        bpSystolicMmHg: 168,
        bpDiastolicMmHg: 112,
        severeHeadache: true,
        firstPncDone: true,
      }),
    );
    const red = cards.find((c) => c.indicator === 'critical');
    expect(red!.detail).toMatch(/magnesium sulphate/i);
  });

  it('first 24 h with no contact done → warning', async () => {
    const cards = await s.evaluate(RULE, req({ postpartumHours: 12, firstPncDone: false }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/First postnatal contact/);
  });

  it('Hb < 9 at week 5 → warning anaemia workup', async () => {
    const cards = await s.evaluate(RULE, req({ postpartumDays: 35, haemoglobinGdl: 7.5 }));
    const anaemia = cards.find((c) => /anaemia/i.test(c.summary));
    expect(anaemia).toBeTruthy();
    expect(anaemia!.detail).toMatch(/ferrous sulphate/i);
  });

  it('EPDS ≥ 13 → warning mental-health pathway', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ postpartumDays: 28, epdsScore: 16, week6PncDone: false }),
    );
    const epds = cards.find((c) => /EPDS/.test(c.summary));
    expect(epds).toBeTruthy();
    expect(epds!.detail).toMatch(/sertraline/i);
  });

  it('week-6 routine → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ postpartumDays: 40, firstPncDone: true, day3PncDone: true, day7PncDone: true }),
    );
    const info = cards.find((c) => c.indicator === 'info');
    expect(info).toBeTruthy();
  });
});
