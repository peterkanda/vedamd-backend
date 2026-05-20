import { describe, expect, it } from 'vitest';
import { NeonatalSepsisStrategy } from '../src/modules/cds/strategies/neonatal-sepsis.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'neonatal-sepsis',
  hook: 'patient-view',
  type: 'neonatal-sepsis',
  services: ['vedamd-neonatal-sepsis'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO PSBI' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 't', context };
}

describe('NeonatalSepsisStrategy', () => {
  const s = new NeonatalSepsisStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageHours: 48 }))).toEqual([]);
  });

  it('PSBI features → critical, ampicillin + gentamicin weight-banded', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedNeonatalSepsis: true,
        ageHours: 24,
        gestationalAgeWeeks: 38,
        weightKg: 3.2,
        temperatureC: 38.5,
        respiratoryRatePerMin: 70,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/PSBI|Possible Serious Bacterial Infection/);
    expect(cards[0].detail).toMatch(/ampicillin 160 mg/); // 50 * 3.2
    expect(cards[0].detail).toMatch(/gentamicin 16\.0 mg/); // 5 * 3.2
  });

  it('bulging fontanelle → meningitis line + ceftriaxone', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedNeonatalSepsis: true,
        ageHours: 96,
        weightKg: 3.0,
        bulgingFontanelle: true,
      }),
    );
    expect(cards[0].detail).toMatch(/meningitis/i);
    expect(cards[0].detail).toMatch(/ceftriaxone 150 mg|cefotaxime/);
  });

  it('referral not possible → WHO 2015 outpatient regimen', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedNeonatalSepsis: true,
        ageHours: 240,
        weightKg: 3.5,
        respiratoryRatePerMin: 70,
        referralPossible: false,
      }),
    );
    expect(cards[0].detail).toMatch(/simplified outpatient PSBI/i);
  });

  it('risk factors in a well infant → warning, 48 h observation', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedNeonatalSepsis: true,
        ageHours: 6,
        weightKg: 3.0,
        gestationalAgeWeeks: 38,
        prolongedRomHours: 24,
        intrapartumFever: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/48 hours of observation/);
  });

  it('well infant, no risk → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedNeonatalSepsis: true,
        ageHours: 12,
        weightKg: 3.2,
        gestationalAgeWeeks: 39,
      }),
    );
    expect(cards[0].indicator).toBe('info');
  });
});
