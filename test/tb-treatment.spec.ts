import { describe, expect, it } from 'vitest';
import { TbTreatmentStrategy } from '../src/modules/cds/strategies/tb-treatment.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'tb-treatment',
  hook: 'patient-view',
  type: 'tb-treatment',
  services: ['vedamd-tb-treatment'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO TB' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('TbTreatmentStrategy', () => {
  const s = new TbTreatmentStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30 }))).toEqual([]);
  });

  it('drug-susceptible pulmonary → critical 2HRZE/4HR, weight band', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        tbConfirmed: true,
        ageYears: 30,
        weightKg: 60,
        tbCategory: 'pulmonary-ds',
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Drug-susceptible/);
    expect(cards[0].detail).toMatch(/55–70 kg band/);
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'A15')).toBeTruthy();
    expect(codings.find((c) => c.code === '1B10')).toBeTruthy();
  });

  it('HIV+ adds DTG twice-daily warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        tbConfirmed: true,
        ageYears: 30,
        weightKg: 55,
        tbCategory: 'pulmonary-ds',
        hivStatus: 'positive',
      }),
    );
    expect(cards[0].detail).toMatch(/dolutegravir 50 mg twice daily/i);
  });

  it('Xpert rifampicin-resistant inferred → MDR BPaL(M)', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        tbConfirmed: true,
        ageYears: 35,
        xpertResult: 'mtb-pos-rif-res',
      }),
    );
    expect(cards[0].summary).toMatch(/PMDT/);
    expect(cards[0].detail).toMatch(/BPaL/);
  });

  it('pre-XDR → reference centre individualised', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        tbConfirmed: true,
        ageYears: 40,
        tbCategory: 'pre-xdr',
      }),
    );
    expect(cards[0].summary).toMatch(/Pre-XDR/);
  });

  it('no category info → warning to confirm', async () => {
    const cards = await s.evaluate(RULE, req({ tbConfirmed: true, ageYears: 30 }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/confirm category/i);
  });
});
