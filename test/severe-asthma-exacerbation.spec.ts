import { describe, expect, it } from 'vitest';
import { SevereAsthmaExacerbationStrategy } from '../src/modules/cds/strategies/severe-asthma-exacerbation.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'severe-asthma-exacerbation',
  hook: 'patient-view',
  type: 'severe-asthma-exacerbation',
  services: ['vedamd-severe-asthma-exacerbation'],
  title: '...',
  description: '...',
  references: [{ label: 'GINA 2024' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('SevereAsthmaExacerbationStrategy', () => {
  const s = new SevereAsthmaExacerbationStrategy();

  it('silent without knownAsthma', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 30, oxygenSatPercent: 80 })),
    ).toEqual([]);
  });

  it('silent for under-5 (uses paediatric pathway)', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 4, knownAsthma: true, oxygenSatPercent: 85 }),
      ),
    ).toEqual([]);
  });

  it('silent chest → life-threatening critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 28, knownAsthma: true, silentChest: true }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/LIFE-THREATENING/);
    expect(cards[0].detail).toMatch(/magnesium/);
  });

  it('SpO₂ < 90 → life-threatening critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 35, knownAsthma: true, oxygenSatPercent: 85 }),
    );
    expect(cards[0].summary).toMatch(/LIFE-THREATENING/);
  });

  it('PEF 45% + RR 32 → severe critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        knownAsthma: true,
        peakFlowPercentBest: 45,
        respiratoryRatePerMin: 32,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Severe acute/);
  });

  it('moderate (PEF 70%, RR 22) → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 40,
        knownAsthma: true,
        peakFlowPercentBest: 70,
        respiratoryRatePerMin: 22,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/prednisolone/);
  });

  it('PEF 95% → info, action plan', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 40, knownAsthma: true, peakFlowPercentBest: 95 }),
    );
    expect(cards[0].indicator).toBe('info');
  });
});
