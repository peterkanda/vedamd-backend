import { describe, expect, it } from 'vitest';
import { ViralHepatitisScreenStrategy } from '../src/modules/cds/strategies/viral-hepatitis-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'viral-hepatitis-screen',
  hook: 'patient-view',
  type: 'viral-hepatitis-screen',
  services: ['vedamd-viral-hepatitis-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('ViralHepatitisScreenStrategy', () => {
  const s = new ViralHepatitisScreenStrategy();

  it('silent when adult tested and negative + no risk', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 40, hbsAgStatus: 'negative', antiHcvStatus: 'negative' }),
      ),
    ).toEqual([]);
  });

  it('HBsAg positive with cirrhosis → critical, start tenofovir', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 50, hbsAgStatus: 'positive', cirrhosisDocumented: true }),
    );
    const hbv = cards.find((c) => /HBsAg-positive with cirrhosis/.test(c.summary));
    expect(hbv).toBeTruthy();
    expect(hbv!.indicator).toBe('critical');
    expect(hbv!.detail).toMatch(/tenofovir/);
  });

  it('HCV-RNA positive → critical, DAA linkage', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 45, hcvRnaStatus: 'positive' }),
    );
    const hcv = cards.find((c) => /HCV active/.test(c.summary));
    expect(hcv).toBeTruthy();
    expect(hcv!.detail).toMatch(/sofosbuvir/i);
  });

  it('pregnant + HBsAg unknown → critical antenatal offer', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 28, pregnant: true, hbsAgStatus: 'unknown' }),
    );
    expect(cards.find((c) => /Antenatal HBV/.test(c.summary))).toBeTruthy();
  });

  it('PWID never tested → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, keyPopulation: 'pwid' }),
    );
    const warn = cards.find((c) => c.indicator === 'warning');
    expect(warn).toBeTruthy();
    expect(warn!.detail).toMatch(/inject/);
  });

  it('routine adult offer when no markers and never tested', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 35 }));
    const info = cards.find((c) => c.indicator === 'info');
    expect(info).toBeTruthy();
    expect(info!.summary).toMatch(/one-time/);
  });
});
