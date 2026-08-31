import { describe, expect, it } from 'vitest';
import { CiwaArStrategy } from '../src/modules/cds/strategies/ciwa-ar.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const rule = {
  id: 'alcohol-withdrawal-ciwa',
  type: 'alcohol-withdrawal-ciwa',
  hook: 'patient-view',
  title: 'CIWA-Ar',
  description: '',
  references: [{ label: 'NICE CG100' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
} as unknown as CdsRule;

const strat = new CiwaArStrategy();
const req = (context: Record<string, unknown>): CdsHookRequest => ({
  hook: 'patient-view',
  hookInstance: 't',
  context,
});

describe('Alcohol withdrawal — CIWA-Ar', () => {
  it('does not fire without sentinel or supplied score', async () => {
    expect(await strat.evaluate(rule, req({ tremor: 4 }))).toHaveLength(0);
  });

  it('fires on a directly supplied ciwaScore', async () => {
    const cards = await strat.evaluate(rule, req({ ciwaScore: 5 }));
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toMatch(/score supplied directly/);
  });

  it('minimal (< 8) → info, supportive care', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedAlcoholWithdrawal: true, tremor: 2, anxiety: 1 }),
    );
    expect(cards[0].summary).toContain('CIWA-Ar 3');
    expect(cards[0].indicator).toBe('info');
  });

  it('moderate (8–15) → warning, symptom-triggered benzodiazepine', async () => {
    // tremor 4 + sweats 3 + anxiety 3 = 10
    const cards = await strat.evaluate(
      rule,
      req({ suspectedAlcoholWithdrawal: true, tremor: 4, paroxysmalSweats: 3, anxiety: 3 }),
    );
    expect(cards[0].summary).toContain('CIWA-Ar 10');
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/symptom-triggered/i);
    expect(cards[0].detail).toMatch(/thiamine/i);
  });

  it('severe (> 15) → critical, delirium-tremens vigilance', async () => {
    const cards = await strat.evaluate(
      rule,
      req({
        suspectedAlcoholWithdrawal: true,
        tremor: 7,
        paroxysmalSweats: 6,
        anxiety: 5,
        agitation: 4,
      }),
    );
    expect(cards[0].summary).toContain('CIWA-Ar 22');
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/delirium|ICU/i);
  });

  it('red flags escalate a moderate score to critical', async () => {
    // tremor 4 + anxiety 4 = 8 (moderate) but prior seizures → critical
    const cards = await strat.evaluate(
      rule,
      req({ suspectedAlcoholWithdrawal: true, tremor: 4, anxiety: 4, seizureHistory: true }),
    );
    expect(cards[0].summary).toContain('CIWA-Ar 8');
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/seizure/i);
  });

  it('tachycardia ≥120 is an autonomic-instability red flag', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedAlcoholWithdrawal: true, tremor: 4, paroxysmalSweats: 4, heartRate: 130 }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/tachycardia 130/);
  });

  it('flags incomplete assessment as a minimum score', async () => {
    const cards = await strat.evaluate(rule, req({ suspectedAlcoholWithdrawal: true, tremor: 2 }));
    expect(cards[0].detail).toMatch(/not supplied/i);
    expect(cards[0].detail).toMatch(/minimum/i);
  });

  it('thiamine-before-glucose appears for treatment-range scores', async () => {
    const cards = await strat.evaluate(rule, req({ ciwaScore: 12 }));
    expect(cards[0].detail).toMatch(/thiamine.*before.*glucose/i);
  });
});
