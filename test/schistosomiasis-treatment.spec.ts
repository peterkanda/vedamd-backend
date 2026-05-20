import { describe, expect, it } from 'vitest';
import { SchistosomiasisTreatmentStrategy } from '../src/modules/cds/strategies/schistosomiasis-treatment.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'schistosomiasis-treatment',
  hook: 'patient-view',
  type: 'schistosomiasis-treatment',
  services: ['vedamd-schistosomiasis-treatment'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO Schisto' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 't', context };
}

describe('SchistosomiasisTreatmentStrategy', () => {
  const s = new SchistosomiasisTreatmentStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25 }))).toEqual([]);
  });

  it('confirmed S. mansoni 60 kg → praziquantel 2400 mg single dose', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 25,
        weightKg: 60,
        speciesSuspected: 'mansoni',
        diagnosticConfirmed: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/2400 mg/);
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'P02BA01')).toBeTruthy();
    expect(codings.find((c) => c.code === '32517009')).toBeTruthy();
  });

  it('S. japonicum 60 kg → 60 mg/kg = 3600 mg split twice', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 25,
        weightKg: 60,
        speciesSuspected: 'japonicum',
        diagnosticConfirmed: true,
      }),
    );
    expect(cards[0].detail).toMatch(/3600 mg/);
    expect(cards[0].detail).toMatch(/1800 mg twice/);
  });

  it('Katayama fever → prednisolone FIRST, defer praziquantel', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 30,
        weightKg: 70,
        katayamaFeatures: true,
        freshwaterContactWeeksAgo: 6,
      }),
    );
    expect(cards[0].summary).toMatch(/Katayama/);
    expect(cards[0].detail).toMatch(/prednisolone 1 mg\/kg/);
  });

  it('neuroschistosomiasis → critical with steroid-before-praziquantel warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 40,
        weightKg: 70,
        neuroSchistoSuspected: true,
      }),
    );
    expect(cards[0].summary).toMatch(/Complicated/);
    expect(cards[0].detail).toMatch(/prednisolone/);
  });

  it('MDA eligibility info card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 10,
        endemicAreaResidence: true,
      }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Mass drug administration/);
  });

  it('first-trimester pregnancy → defer praziquantel', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedSchistosomiasis: true,
        ageYears: 28,
        weightKg: 60,
        pregnant: true,
        gestationalAgeWeeks: 10,
        diagnosticConfirmed: true,
      }),
    );
    expect(cards[0].detail).toMatch(/defer praziquantel/);
  });
});
