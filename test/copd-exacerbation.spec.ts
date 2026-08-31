import { describe, expect, it } from 'vitest';
import { CopdExacerbationStrategy } from '../src/modules/cds/strategies/copd-exacerbation.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'copd-exacerbation',
  hook: 'patient-view',
  type: 'copd-exacerbation',
  services: ['vedamd-copd-exacerbation'],
  title: '...',
  description: '...',
  references: [{ label: 'GOLD 2024' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('CopdExacerbationStrategy', () => {
  const s = new CopdExacerbationStrategy();

  it('silent without knownCopd', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 60, increasedDyspnoea: true }))).toEqual([]);
  });

  it('mild symptoms → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 60, knownCopd: true, increasedDyspnoea: true }),
    );
    expect(cards[0].indicator).toBe('info');
  });

  it('two Anthonisen symptoms with purulent sputum → moderate warning with antibiotic', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        knownCopd: true,
        increasedDyspnoea: true,
        increasedSputumVolume: true,
        sputumPurulent: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/amoxicillin|doxycycline/);
  });

  it('two Anthonisen without purulent sputum → no routine antibiotic line', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 65,
        knownCopd: true,
        increasedDyspnoea: true,
        increasedSputumVolume: true,
      }),
    );
    expect(cards[0].detail).toMatch(/NOT needed/);
  });

  it('RR ≥30 → severe critical, controlled oxygen 88–92', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 70,
        knownCopd: true,
        respiratoryRatePerMin: 32,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/88–92/);
  });

  it('SpO2 < 88 → severe critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 70, knownCopd: true, oxygenSatPercent: 86 }),
    );
    expect(cards[0].indicator).toBe('critical');
  });
});
