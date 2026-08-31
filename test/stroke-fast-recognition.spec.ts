import { describe, expect, it } from 'vitest';
import { StrokeFastRecognitionStrategy } from '../src/modules/cds/strategies/stroke-fast-recognition.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'stroke-fast-recognition',
  hook: 'patient-view',
  type: 'stroke-fast-recognition',
  services: ['vedamd-stroke-fast-recognition'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO PEN HEARTS' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('StrokeFastRecognitionStrategy', () => {
  const s = new StrokeFastRecognitionStrategy();

  it('silent without suspectedStroke', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 60, faceDroop: true }))).toEqual([]);
  });

  it('no features → info reassess', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 60, suspectedStroke: true }));
    expect(cards[0].indicator).toBe('info');
  });

  it('FAST positive within 90 min → critical IN WINDOW', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        suspectedStroke: true,
        faceDroop: true,
        armWeakness: true,
        minutesSinceOnset: 90,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/IN THROMBOLYSIS WINDOW/);
    expect(cards[0].detail).toMatch(/WITHIN the 270-minute/);
  });

  it('FAST positive at 8h → critical OUTSIDE window', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        suspectedStroke: true,
        speechSlurredOrAphasia: true,
        minutesSinceOnset: 480,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/OUTSIDE/);
  });

  it('low glucose triggers hypoglycaemia-mimic line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 55,
        suspectedStroke: true,
        armWeakness: true,
        bloodGlucoseMmolL: 2.8,
      }),
    );
    expect(cards[0].detail).toMatch(/treat hypoglycaemia/);
  });

  it('flags anticoagulation when set', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        suspectedStroke: true,
        faceDroop: true,
        onAnticoagulant: true,
      }),
    );
    expect(cards[0].detail).toMatch(/anticoagulation/);
  });

  it('does not fire for paediatric patients', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 15, suspectedStroke: true, faceDroop: true })),
    ).toEqual([]);
  });
});
