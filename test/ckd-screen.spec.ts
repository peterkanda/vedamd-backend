import { describe, expect, it } from 'vitest';
import { CkdScreenStrategy } from '../src/modules/cds/strategies/ckd-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'ckd-screen',
  hook: 'patient-view',
  type: 'ckd-screen',
  services: ['vedamd-ckd-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'KDIGO' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('CkdScreenStrategy', () => {
  const s = new CkdScreenStrategy();

  it('silent for adult with no risk markers and no labs', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 40 }))).toEqual([]);
  });

  it('eGFR 22 → critical advanced CKD', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 55, egfrMlMin: 22 }));
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Advanced CKD/);
  });

  it('K ≥ 6 triggers hyperkalaemia bundle in detail', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 60, egfrMlMin: 25, potassiumMmolL: 6.5 }));
    expect(cards[0].detail).toMatch(/calcium gluconate/i);
  });

  it('uACR 500 mg/g → critical heavy proteinuria + SGLT2i', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 45, egfrMlMin: 50, uacrMgPerG: 500 }));
    expect(cards[0].summary).toMatch(/Heavy proteinuria/);
    expect(cards[0].detail).toMatch(/SGLT2/);
  });

  it('eGFR 40 → warning moderate CKD', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 65, egfrMlMin: 40 }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Moderate CKD/);
  });

  it('high-risk + no labs → warning order eGFR + uACR', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 50, knownHtn: true, knownDiabetes: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/eGFR by CKD-EPI/);
  });

  it('rapid eGFR decline → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 55,
        egfrMlMin: 50,
        priorEgfrMlMin: 70,
        priorEgfrAgeMonths: 12,
      }),
    );
    expect(cards[0].summary).toMatch(/Heavy proteinuria|declining/);
  });
});
