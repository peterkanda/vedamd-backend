import { describe, expect, it } from 'vitest';
import { RabiesPepStrategy } from '../src/modules/cds/strategies/rabies-pep.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'rabies-pep',
  hook: 'patient-view',
  type: 'rabies-pep',
  services: ['vedamd-rabies-pep'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO Rabies' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('RabiesPepStrategy', () => {
  const s = new RabiesPepStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({}))).toEqual([]);
  });

  it('Category III → critical, RIG dose calculated, codings present', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedRabiesExposure: true,
        exposureCategory: 'III',
        weightKg: 70,
        bitingSpecies: 'dog',
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/1400 IU/); // 20 * 70 = 1400
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'Z20.3')).toBeTruthy();
    expect(codings.find((c) => c.code === '14168008')).toBeTruthy();
    expect(codings.find((c) => c.code === 'J06BB05')).toBeTruthy();
  });

  it('bat exposure auto-classified Category III', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ suspectedRabiesExposure: true, bitingSpecies: 'bat' }),
    );
    expect(cards[0].summary).toMatch(/Category III/);
  });

  it('Category II → vaccine, no RIG', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ suspectedRabiesExposure: true, exposureCategory: 'II' }),
    );
    expect(cards[0].detail).toMatch(/NOT indicated/);
  });

  it('previously fully vaccinated → 2-dose booster', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedRabiesExposure: true,
        exposureCategory: 'III',
        previousFullPepCourse: true,
      }),
    );
    expect(cards[0].summary).toMatch(/abbreviated booster/);
    expect(cards[0].detail).toMatch(/days 0 and 3/);
  });

  it('rodent contact → info Category I', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ suspectedRabiesExposure: true, bitingSpecies: 'rodent-lagomorph' }),
    );
    expect(cards[0].indicator).toBe('info');
  });

  it('late presentation still triggers PEP', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        suspectedRabiesExposure: true,
        exposureCategory: 'III',
        weightKg: 70,
        daysSinceExposure: 14,
      }),
    );
    expect(cards[0].detail).toMatch(/never too late/i);
  });
});
