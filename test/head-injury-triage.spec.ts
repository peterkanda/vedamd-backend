import { describe, expect, it } from 'vitest';
import { HeadInjuryTriageStrategy } from '../src/modules/cds/strategies/head-injury-triage.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'head-injury-triage',
  hook: 'patient-view',
  type: 'head-injury-triage',
  services: ['vedamd-head-injury-triage'],
  title: '...',
  description: '...',
  references: [{ label: 'NICE NG232' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('HeadInjuryTriageStrategy', () => {
  const s = new HeadInjuryTriageStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30, gcs: 12 }))).toEqual([]);
  });

  it('GCS 6 → severe TBI critical card with TXA in window', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 28, suspectedHeadInjury: true, gcs: 6, minutesSinceInjury: 60 }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe TBI/);
    expect(cards[0].detail).toMatch(/Tranexamic acid 1 g/);
  });

  it('TXA window passed → suppressed', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedHeadInjury: true,
        gcs: 7,
        minutesSinceInjury: 240,
      }),
    );
    expect(cards[0].detail).toMatch(/Tranexamic acid window has passed/);
  });

  it('unilateral fixed pupil → herniation features + hypertonic saline', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        suspectedHeadInjury: true,
        gcs: 10,
        unilateralFixedPupil: true,
      }),
    );
    expect(cards[0].detail).toMatch(/hypertonic saline/i);
  });

  it('moderate GCS 11 → critical urgent CT', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 35, suspectedHeadInjury: true, gcs: 11 }));
    expect(cards[0].summary).toMatch(/urgent CT/i);
  });

  it('elderly + LOC → high-risk urgent CT', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        suspectedHeadInjury: true,
        gcs: 15,
        lossOfConsciousness: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('mild + single vomit → warning 4-h observation', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 25,
        suspectedHeadInjury: true,
        gcs: 15,
        vomitingEpisodes: 1,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/4 hours/);
  });

  it('low-risk → info discharge with card', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 30, suspectedHeadInjury: true, gcs: 15 }));
    expect(cards[0].indicator).toBe('info');
  });
});
