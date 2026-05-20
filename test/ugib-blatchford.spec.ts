import { describe, expect, it } from 'vitest';
import { UgibBlatchfordStrategy } from '../src/modules/cds/strategies/ugib-blatchford.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const rule = {
  id: 'upper-gi-bleed-glasgow-blatchford',
  type: 'upper-gi-bleed-blatchford',
  hook: 'patient-view',
  title: 'UGIB GBS',
  description: '',
  references: [{ label: 'NICE CG141' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
} as unknown as CdsRule;

const strat = new UgibBlatchfordStrategy();
const req = (context: Record<string, unknown>): CdsHookRequest => ({ hook: 'patient-view', hookInstance: 't', context });

describe('UGIB — Glasgow-Blatchford Score', () => {
  it('does not fire without GI-bleed sentinel', async () => {
    expect(await strat.evaluate(rule, req({ ureaMmolL: 30, hbGramsPerLitre: 70 }))).toHaveLength(0);
  });

  it('fires on haematemesis flag', async () => {
    const cards = await strat.evaluate(rule, req({ haematemesis: true }));
    expect(cards).toHaveLength(1);
  });

  it('GBS 0 (all normal) → very low risk / info', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedUpperGiBleed: true, ureaMmolL: 5, hbGramsPerLitre: 150, sex: 'male', systolicMmHg: 130, pulsePerMin: 70 }),
    );
    expect(cards[0].summary).toContain('Glasgow-Blatchford 0');
    expect(cards[0].indicator).toBe('info');
  });

  it('computes a high score correctly → critical', async () => {
    // urea 30 (+6), Hb 70 men (+6), SBP 88 (+3), pulse 110 (+1), melaena (+1), syncope (+2) = 19
    const cards = await strat.evaluate(
      rule,
      req({
        suspectedUpperGiBleed: true,
        ureaMmolL: 30,
        hbGramsPerLitre: 70,
        sex: 'male',
        systolicMmHg: 88,
        pulsePerMin: 110,
        melaena: true,
        syncope: true,
      }),
    );
    expect(cards[0].summary).toContain('Glasgow-Blatchford 19');
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/urgent.*endoscopy/i);
  });

  it('sex-specific Hb: 110 g/L scores 3 (man) but 1 (woman)', async () => {
    const man = await strat.evaluate(rule, req({ suspectedUpperGiBleed: true, hbGramsPerLitre: 110, sex: 'male' }));
    const woman = await strat.evaluate(rule, req({ suspectedUpperGiBleed: true, hbGramsPerLitre: 110, sex: 'female' }));
    expect(man[0].summary).toContain('Glasgow-Blatchford 3');
    expect(woman[0].summary).toContain('Glasgow-Blatchford 1');
  });

  it('auto-detects g/dL haemoglobin (value < 25)', async () => {
    // Hb 7 g/dL → 70 g/L → +6 (man)
    const cards = await strat.evaluate(rule, req({ suspectedUpperGiBleed: true, hbGramsPerLitre: 7, sex: 'male' }));
    expect(cards[0].summary).toContain('Glasgow-Blatchford 6');
    expect(cards[0].detail).toMatch(/Hb 70 g\/L/);
  });

  it('flags missing inputs as a minimum score', async () => {
    const cards = await strat.evaluate(rule, req({ suspectedUpperGiBleed: true, melaena: true }));
    expect(cards[0].detail).toMatch(/not supplied/i);
    expect(cards[0].detail).toMatch(/minimum/i);
  });

  it('score 1-5 → admit (warning), do not discharge', async () => {
    const cards = await strat.evaluate(rule, req({ suspectedUpperGiBleed: true, ureaMmolL: 9, hbGramsPerLitre: 140, sex: 'male', systolicMmHg: 130 }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/do not discharge/i);
  });
});
