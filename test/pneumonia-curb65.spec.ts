import { describe, expect, it } from 'vitest';
import { PneumoniaCurb65Strategy } from '../src/modules/cds/strategies/pneumonia-curb65.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const rule = {
  id: 'pneumonia-curb65-treatment',
  type: 'pneumonia-curb65-treatment',
  hook: 'patient-view',
  title: 'CURB-65',
  description: '',
  references: [{ label: 'BTS CAP 2009' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
} as unknown as CdsRule;

const strat = new PneumoniaCurb65Strategy();
const req = (context: Record<string, unknown>): CdsHookRequest => ({ hook: 'patient-view', hookInstance: 't', context });

describe('CAP — CURB-65 + antibiotic choice', () => {
  it('does not fire without the pneumonia sentinel', async () => {
    expect(await strat.evaluate(rule, req({ ageYears: 80, urea: 12 }))).toHaveLength(0);
  });

  it('does not fire for children', async () => {
    expect(await strat.evaluate(rule, req({ suspectedPneumonia: true, ageYears: 4 }))).toHaveLength(0);
  });

  it('low risk (0–1) → info, outpatient amoxicillin', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedPneumonia: true, ageYears: 40, confusion: false, urea: 4, respiratoryRate: 18, systolicBp: 120, diastolicBp: 80 }),
    );
    expect(cards[0].summary).toContain('CURB-65 0');
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].detail).toMatch(/amoxicillin/i);
  });

  it('moderate (score 2) → warning, ward + macrolide', async () => {
    // age≥65 (1) + urea>7 (1) = 2
    const cards = await strat.evaluate(
      rule,
      req({ suspectedPneumonia: true, ageYears: 72, confusion: false, urea: 9, respiratoryRate: 18, systolicBp: 130, diastolicBp: 80 }),
    );
    expect(cards[0].summary).toContain('CURB-65 2');
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/macrolide|clarithromycin/i);
  });

  it('high risk (≥3) → critical, admit + IV, assess ICU', async () => {
    // confusion (1) + urea>7 (1) + RR≥30 (1) + age≥65 (1) = 4
    const cards = await strat.evaluate(
      rule,
      req({ suspectedPneumonia: true, ageYears: 78, confusion: true, urea: 15, respiratoryRate: 32, systolicBp: 110, diastolicBp: 70 }),
    );
    expect(cards[0].summary).toContain('CURB-65 4');
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/ICU/i);
    expect(cards[0].detail).toMatch(/co-amoxiclav|ceftriaxone/i);
  });

  it('accepts the ureaMmolL / systolicMmHg aliases', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedPneumonia: true, ageYears: 50, confusion: false, ureaMmolL: 9, respiratoryRatePerMin: 18, systolicMmHg: 120, diastolicMmHg: 80 }),
    );
    expect(cards[0].summary).toContain('CURB-65 1');
    expect(cards[0].detail).toMatch(/urea 9 mmol\/L/);
  });

  it('flags missing inputs as a minimum score', async () => {
    const cards = await strat.evaluate(rule, req({ suspectedPneumonia: true, ageYears: 70 }));
    expect(cards[0].detail).toMatch(/not supplied/i);
    expect(cards[0].detail).toMatch(/minimum/i);
  });

  it('low SpO₂ escalates a low score to warning', async () => {
    const cards = await strat.evaluate(
      rule,
      req({ suspectedPneumonia: true, ageYears: 40, confusion: false, urea: 4, respiratoryRate: 18, systolicBp: 120, diastolicBp: 80, oxygenSatPercent: 88 }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/SpO₂ 88%/);
  });
});
