import { describe, expect, it } from 'vitest';
import { StatusEpilepticusStrategy } from '../src/modules/cds/strategies/status-epilepticus.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'status-epilepticus',
  hook: 'patient-view',
  type: 'status-epilepticus',
  services: ['vedamd-status-epilepticus'],
  title: '...',
  description: '...',
  references: [{ label: 'mhGAP' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('StatusEpilepticusStrategy', () => {
  const s = new StatusEpilepticusStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30 }))).toEqual([]);
  });

  it('active seizure ≥ 5 min → status bundle (weight-banded lorazepam)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        weightKg: 70,
        suspectedSeizure: true,
        activeConvulsion: true,
        seizureDurationMinutes: 8,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Status epilepticus/);
    // 0.1 mg/kg × 70 kg = 7 mg → capped at 4 mg
    expect(cards[0].detail).toMatch(/lorazepam 4 mg IV/);
    // 20 mg/kg × 70 kg = 1400 mg phenytoin
    expect(cards[0].detail).toMatch(/phenytoin 1400 mg/);
  });

  it('active seizure in pregnancy → magnesium sulphate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        suspectedSeizure: true,
        activeConvulsion: true,
        pregnant: true,
        bpSystolicMmHg: 170,
        bpDiastolicMmHg: 115,
      }),
    );
    expect(cards[0].summary).toMatch(/eclampsia/i);
    expect(cards[0].detail).toMatch(/Magnesium sulphate/i);
    expect(cards[0].detail).toMatch(/labetalol|hydralazine/);
  });

  it('post-ictal hypoglycaemia → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        suspectedSeizure: true,
        fingerStickGlucoseMmolL: 2.5,
      }),
    );
    expect(cards[0].summary).toMatch(/hypoglycaemia/i);
  });

  it('first-ever post-ictal with focal signs → warning + urgent CT', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 45,
        suspectedSeizure: true,
        firstEverSeizure: true,
        focalNeurologicalSigns: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/Urgent CT/);
  });

  it('known epilepsy break-through → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedSeizure: true,
        knownEpilepsy: true,
      }),
    );
    expect(cards[0].indicator).toBe('info');
  });
});
