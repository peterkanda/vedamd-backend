import { describe, expect, it } from 'vitest';
import { SickleCellCrisisStrategy } from '../src/modules/cds/strategies/sickle-cell-crisis.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'sickle-cell-crisis',
  hook: 'patient-view',
  type: 'sickle-cell-crisis',
  services: ['vedamd-sickle-cell-crisis'],
  title: '...',
  description: '...',
  references: [{ label: 'ASH 2020' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('SickleCellCrisisStrategy', () => {
  const s = new SickleCellCrisisStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 25 }))).toEqual([]);
  });

  it('acute chest syndrome features → critical emergency bundle, codings present', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        sickleCellDisease: true,
        ageYears: 22,
        weightKg: 60,
        spO2Percent: 88,
        newPulmonaryInfiltrate: true,
        painSeverity: 8,
      }),
    );
    const emerg = cards.find((c) => /emergency/i.test(c.summary));
    expect(emerg).toBeTruthy();
    expect(emerg!.indicator).toBe('critical');
    expect(emerg!.detail).toMatch(/morphine 6\.0 mg IV/);
    const codings = emerg!.extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'D57.0')).toBeTruthy();
    expect(codings.find((c) => c.code === '417847000')).toBeTruthy();
  });

  it('vaso-occlusive pain crisis only → critical pain bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        sickleCellDisease: true,
        ageYears: 25,
        weightKg: 70,
        painSeverity: 8,
      }),
    );
    const pain = cards.find((c) => /pain crisis/i.test(c.summary));
    expect(pain).toBeTruthy();
    expect(pain!.detail).toMatch(/within 30 min/);
  });

  it('priapism > 4 h escalates to emergency', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        sickleCellDisease: true,
        ageYears: 30,
        priapismHours: 6,
        painSeverity: 5,
      }),
    );
    const emerg = cards.find((c) => /emergency/i.test(c.summary));
    expect(emerg).toBeTruthy();
    expect(emerg!.detail).toMatch(/priapism/i);
  });

  it('chronic-care gaps when no acute features → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        sickleCellDisease: true,
        ageYears: 3,
        penicillinProphylaxis: false,
        onHydroxyurea: false,
      }),
    );
    const warn = cards.find((c) => c.indicator === 'warning');
    expect(warn).toBeTruthy();
    expect(warn!.detail).toMatch(/penicillin V/);
  });

  it('fully optimised stable patient → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        sickleCellDisease: true,
        ageYears: 18,
        onHydroxyurea: true,
        pneumococcalVaccinated: true,
        influenzaVaccinated: true,
        retinalScreenDone: true,
        folicAcidSupplementation: true,
      }),
    );
    expect(cards[cards.length - 1].indicator).toBe('info');
  });
});
