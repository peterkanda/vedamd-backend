import { describe, expect, it } from 'vitest';
import { AfibAnticoagulationStrategy } from '../src/modules/cds/strategies/afib-anticoagulation.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const rule = {
  id: 'afib-cha2ds2vasc-anticoag',
  type: 'afib-anticoagulation',
  hook: 'patient-view',
  title: 'AF anticoagulation',
  description: '',
  references: [{ label: 'ESC AF 2024' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
} as unknown as CdsRule;

const strat = new AfibAnticoagulationStrategy();
const req = (context: Record<string, unknown>): CdsHookRequest => ({
  hook: 'patient-view',
  hookInstance: 't',
  context,
});

describe('AF anticoagulation — CHA₂DS₂-VASc + HAS-BLED', () => {
  it('does not fire without AF', async () => {
    const cards = await strat.evaluate(rule, req({ ageYears: 80, hypertension: true }));
    expect(cards).toHaveLength(0);
  });

  it('fires from the diagnoses list', async () => {
    const cards = await strat.evaluate(rule, req({ diagnoses: ['atrial fibrillation'], ageYears: 50, sex: 'male' }));
    expect(cards).toHaveLength(1);
  });

  it('computes score 0 (man, no risk factors) → not indicated', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 50, sex: 'male' }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 0');
  });

  it('female sex alone (score 1) → not routinely indicated', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 50, sex: 'female' }));
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 1');
    expect(cards[0].indicator).toBe('info');
  });

  it('man with HTN (score 1) → consider (warning)', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 50, sex: 'male', hypertension: true }));
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 1');
    expect(cards[0].indicator).toBe('warning');
  });

  it('age ≥75 scores 2 → recommend (critical)', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 78, sex: 'male' }));
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 2');
    expect(cards[0].indicator).toBe('critical');
  });

  it('prior stroke scores 2 → recommend', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 60, sex: 'male', priorStroke: true }));
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 2');
    expect(cards[0].indicator).toBe('critical');
  });

  it('full house computes correctly: CHF+HTN+age75+DM+stroke+vasc+female = 9', async () => {
    const cards = await strat.evaluate(
      rule,
      req({
        hasAtrialFibrillation: true,
        ageYears: 80,
        sex: 'female',
        chf: true,
        hypertension: true,
        diabetes: true,
        priorStroke: true,
        vascularDisease: true,
      }),
    );
    expect(cards[0].summary).toContain('CHA₂DS₂-VASc 9');
    expect(cards[0].indicator).toBe('critical');
  });

  it('valvular AF recommends warfarin not DOAC', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 78, sex: 'male', valvularAf: true }));
    expect(cards[0].detail).toMatch(/vitamin-K antagonist|warfarin/i);
    expect(cards[0].detail).toMatch(/DOACs are contraindicated/i);
  });

  it('high HAS-BLED prompts addressing factors, not withholding', async () => {
    const cards = await strat.evaluate(
      rule,
      req({
        hasAtrialFibrillation: true,
        ageYears: 80,
        sex: 'male',
        priorStroke: true,
        uncontrolledHypertension: true,
        bleedingHistory: true,
        antiplateletOrNsaid: true,
      }),
    );
    expect(cards[0].detail).toMatch(/HAS-BLED/);
    expect(cards[0].detail).toMatch(/do NOT withhold anticoagulation/i);
    expect(cards[0].indicator).toBe('critical');
  });

  it('never recommends aspirin for AF stroke prevention', async () => {
    const cards = await strat.evaluate(rule, req({ hasAtrialFibrillation: true, ageYears: 78, sex: 'male' }));
    expect(cards[0].detail).toMatch(/NOT use aspirin/i);
  });
});
