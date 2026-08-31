import { describe, expect, it } from 'vitest';
import { AdultCapCrb65Strategy } from '../src/modules/cds/strategies/adult-cap-crb65.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'adult-cap-crb65',
  hook: 'patient-view',
  type: 'adult-cap-crb65',
  services: ['vedamd-adult-cap-crb65'],
  title: '...',
  description: '...',
  references: [{ label: 'BTS CAP guideline' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AdultCapCrb65Strategy', () => {
  const s = new AdultCapCrb65Strategy();

  it('stays silent without suspectedPneumonia sentinel', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 70, respiratoryRatePerMin: 40, systolicMmHg: 80 })),
    ).toEqual([]);
  });

  it('does not fire for paediatric patients', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 12, suspectedPneumonia: true }))).toEqual([]);
  });

  it('CRB-65 score 0 → low risk info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedPneumonia: true,
        confusion: false,
        respiratoryRatePerMin: 22,
        systolicMmHg: 120,
        diastolicMmHg: 80,
        oxygenSatPercent: 96,
      }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/low risk/);
  });

  it('CRB-65 score 1 (age 65) → moderate warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        suspectedPneumonia: true,
        respiratoryRatePerMin: 22,
        systolicMmHg: 130,
        diastolicMmHg: 80,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/score 1/);
  });

  it('CRB-65 score 3 → high risk critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 78,
        suspectedPneumonia: true,
        confusion: true,
        respiratoryRatePerMin: 34,
        systolicMmHg: 130,
        diastolicMmHg: 78,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/high risk/);
    expect(cards[0].detail).toMatch(/ceftriaxone/);
  });

  it('SpO2 < 92 alone upgrades CRB-65 0 → moderate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedPneumonia: true,
        respiratoryRatePerMin: 22,
        systolicMmHg: 120,
        diastolicMmHg: 80,
        oxygenSatPercent: 88,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/below the 92%/);
  });
});
