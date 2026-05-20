import { describe, expect, it } from 'vitest';
import { NeonatalJaundiceStrategy } from '../src/modules/cds/strategies/neonatal-jaundice.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'neonatal-jaundice',
  hook: 'patient-view',
  type: 'neonatal-jaundice',
  services: ['vedamd-neonatal-jaundice'],
  title: '...',
  description: '...',
  references: [{ label: 'AAP 2022' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('NeonatalJaundiceStrategy', () => {
  const s = new NeonatalJaundiceStrategy();

  it('silent without postnatal age', async () => {
    expect(await s.evaluate(RULE, req({}))).toEqual([]);
  });

  it('acute bilirubin encephalopathy → critical exchange prep', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 96,
        gestationalAgeWeeks: 39,
        totalBilirubinMgDl: 25,
        acuteBilirubinEncephalopathy: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/encephalopathy/i);
    const codings = cards[0].extension?.['http://vedamd.io/Card/recommendation'].codings ?? [];
    expect(codings.find((c) => c.code === 'P57')).toBeTruthy();
  });

  it('jaundice at 12 h is always pathological', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 12,
        gestationalAgeWeeks: 39,
        jaundiceFirst24h: true,
        totalBilirubinMgDl: 8,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/first 24 h/);
  });

  it('TSB at high-risk exchange threshold → critical exchange', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 72,
        gestationalAgeWeeks: 36,
        totalBilirubinMgDl: 22,
        directAntiglobulinPositive: true,
      }),
    );
    expect(cards[0].summary).toMatch(/exchange-transfusion threshold/);
  });

  it('TSB at phototherapy threshold → critical phototherapy', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 72,
        gestationalAgeWeeks: 39,
        totalBilirubinMgDl: 16,
      }),
    );
    expect(cards[0].summary).toMatch(/phototherapy threshold/);
  });

  it('watch zone → warning, repeat 6–12 h', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 72,
        gestationalAgeWeeks: 39,
        totalBilirubinMgDl: 13,
        riseRateMgDlPerHour: 0.3,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/Watch zone|repeat/i);
  });

  it('prolonged jaundice at day 20 with conjugated bilirubin → biliary atresia flag', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageDays: 20,
        gestationalAgeWeeks: 39,
        totalBilirubinMgDl: 14,
        directBilirubinMgDl: 4,
      }),
    );
    expect(cards[0].detail).toMatch(/biliary atresia/i);
  });

  it('umol/L input is converted correctly', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageHours: 72,
        gestationalAgeWeeks: 39,
        totalBilirubinUmolL: 274, // ~16 mg/dL
      }),
    );
    expect(cards[0].summary).toMatch(/phototherapy/);
  });
});
