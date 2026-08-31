import { describe, expect, it } from 'vitest';
import { ImciEarInfectionStrategy } from '../src/modules/cds/strategies/imci-ear-infection.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-ear-infection',
  hook: 'patient-view',
  type: 'imci-ear-infection',
  services: ['vedamd-imci-ear-infection'],
  title: '...',
  description: '...',
  references: [{ label: 'IMCI' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 't', context };
}

describe('ImciEarInfectionStrategy', () => {
  const s = new ImciEarInfectionStrategy();

  it('silent for child ≥ 60 months', async () => {
    expect(await s.evaluate(RULE, req({ ageMonths: 84, suspectedEarProblem: true }))).toEqual([]);
  });

  it('mastoiditis → critical, ceftriaxone weight-banded', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 18,
        weightKg: 12,
        suspectedEarProblem: true,
        tenderSwellingBehindEar: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/mastoiditis/i);
    expect(cards[0].detail).toMatch(/600 mg IV/); // 50 * 12 = 600
  });

  it('acute pus discharge < 14 d → AOM amoxicillin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 24,
        weightKg: 14,
        suspectedEarProblem: true,
        pusFromEar: true,
        pusDurationDays: 3,
      }),
    );
    expect(cards[0].summary).toMatch(/AOM|otitis media/i);
    expect(cards[0].detail).toMatch(/amoxicillin/i);
  });

  it('CSOM ≥ 14 days → warning, dry wicking + topical cipro (NO oral)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 36,
        suspectedEarProblem: true,
        pusFromEar: true,
        pusDurationDays: 21,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/dry wicking/i);
    expect(cards[0].detail).toMatch(/NOT routinely/);
  });

  it('amoxicillin allergy → macrolide alternative', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageMonths: 18,
        weightKg: 12,
        suspectedEarProblem: true,
        earPain: true,
        amoxicillinAllergyIge: true,
      }),
    );
    expect(cards[0].detail).toMatch(/azithromycin|clarithromycin/i);
  });

  it('no infection → info', async () => {
    const cards = await s.evaluate(RULE, req({ ageMonths: 18, suspectedEarProblem: true }));
    expect(cards[0].indicator).toBe('info');
  });
});
