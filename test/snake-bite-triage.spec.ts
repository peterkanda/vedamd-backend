import { describe, expect, it } from 'vitest';
import { SnakeBiteTriageStrategy } from '../src/modules/cds/strategies/snake-bite-triage.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'snake-bite-triage',
  hook: 'patient-view',
  type: 'snake-bite-triage',
  services: ['vedamd-snake-bite-triage'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO snakebite 2016' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('SnakeBiteTriageStrategy', () => {
  const s = new SnakeBiteTriageStrategy();

  it('silent without confirmedBite', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 40, systemicBleeding: true }))).toEqual([]);
  });

  it('failed clotting test → critical antivenom + no-NSAID', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, confirmedBite: true, whole20MinClottingFailed: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/antivenom/);
    expect(cards[0].detail).toMatch(/NSAIDs/);
  });

  it('neurotoxic + paediatric → critical with neostigmine trial + paed note', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 8,
        weightKg: 25,
        confirmedBite: true,
        ptosisOrBulbarPalsy: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/neostigmine/);
    expect(cards[0].detail).toMatch(/Paediatric/);
    expect(cards[0].detail).toMatch(/DO NOT reduce antivenom/);
  });

  it('dry-bite suspected → info 4-hour observe', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 40, confirmedBite: true, dryBiteSuspected: true }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/Dry-bite/);
  });

  it('definite bite without envenomation → warning 24-h observation', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 35, confirmedBite: true }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/24 hours/);
    expect(cards[0].detail).toMatch(/AVOID incision/i);
  });
});
