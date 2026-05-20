import { describe, expect, it } from 'vitest';
import { VteProphylaxisStrategy } from '../src/modules/cds/strategies/vte-prophylaxis.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const rule = {
  id: 'vte-prophylaxis-padua',
  type: 'vte-prophylaxis',
  hook: 'patient-view',
  title: 'VTE prophylaxis',
  description: '',
  references: [{ label: 'ASH 2018' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
} as unknown as CdsRule;

const strat = new VteProphylaxisStrategy();
const req = (context: Record<string, unknown>): CdsHookRequest => ({ hook: 'patient-view', hookInstance: 't', context });

describe('VTE prophylaxis — Padua Prediction Score', () => {
  it('does not fire unless a medical inpatient', async () => {
    expect(await strat.evaluate(rule, req({ activeCancer: true }))).toHaveLength(0);
  });

  it('low risk (score < 4) → info, not indicated', async () => {
    const cards = await strat.evaluate(rule, req({ medicalInpatient: true, ageYears: 72, acuteInfectionOrRheum: true }));
    // age≥70 (1) + infection (1) = 2
    expect(cards[0].summary).toContain('Padua 2');
    expect(cards[0].indicator).toBe('info');
  });

  it('active cancer alone scores 3 → still low (< 4)', async () => {
    const cards = await strat.evaluate(rule, req({ medicalInpatient: true, activeCancer: true }));
    expect(cards[0].summary).toContain('Padua 3');
    expect(cards[0].indicator).toBe('info');
  });

  it('high risk (≥4) without bleeding → critical, offer pharmacological prophylaxis', async () => {
    // active cancer 3 + reduced mobility 3 = 6
    const cards = await strat.evaluate(rule, req({ medicalInpatient: true, activeCancer: true, reducedMobility: true }));
    expect(cards[0].summary).toContain('Padua 6');
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/enoxaparin|fondaparinux/i);
  });

  it('high risk WITH bleeding risk → warning, mechanical prophylaxis only', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ medicalInpatient: true, previousVte: true, reducedMobility: true, highBleedingRisk: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/mechanical/i);
    expect(cards[0].detail).toMatch(/contraindicated/i);
  });

  it('renal dose note present for severe renal impairment guidance', async () => {
    const cards = await strat.evaluate(rule, req({ medicalInpatient: true, activeCancer: true, previousVte: true }));
    expect(cards[0].detail).toMatch(/eGFR <30/);
  });

  it('obesity + age + heart failure compute correctly', async () => {
    // bmi≥30 (1) + age≥70 (1) + cardiac/resp failure (1) + acute MI/stroke (1) = 4 → high
    const cards = await strat.evaluate(
      rule,
      req({ medicalInpatient: true, bmi: 32, ageYears: 75, cardiacOrRespFailure: true, acuteMiOrStroke: true }),
    );
    expect(cards[0].summary).toContain('Padua 4');
    expect(cards[0].indicator).toBe('critical');
  });
});
