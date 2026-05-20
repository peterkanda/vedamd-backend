import { describe, expect, it } from 'vitest';
import { SepsisQSofaStrategy } from '../src/modules/cds/strategies/sepsis-qsofa.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'sepsis-qsofa',
  hook: 'patient-view',
  type: 'sepsis-qsofa',
  services: ['vedamd-sepsis-qsofa'],
  title: '...',
  description: '...',
  references: [{ label: 'SSC 1-hour bundle' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('SepsisQSofaStrategy', () => {
  const s = new SepsisQSofaStrategy();

  it('silent without suspectedInfection', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ ageYears: 60, respiratoryRatePerMin: 28, systolicMmHg: 90 }),
      ),
    ).toEqual([]);
  });

  it('qSOFA 0, no organ dysfn → info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 35,
        suspectedInfection: true,
        respiratoryRatePerMin: 18,
        systolicMmHg: 120,
      }),
    );
    expect(cards[0].indicator).toBe('info');
  });

  it('qSOFA 2 → critical 1-hour bundle', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 60,
        suspectedInfection: true,
        alteredMentation: true,
        respiratoryRatePerMin: 26,
        systolicMmHg: 120,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/1-hour bundle/i);
    expect(cards[0].detail).toMatch(/ceftriaxone|broad-spectrum/);
  });

  it('qSOFA 1 → warning, repeat in 1 h', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 60,
        suspectedInfection: true,
        respiratoryRatePerMin: 24,
        systolicMmHg: 110,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/re-assess qSOFA/);
  });

  it('lactate ≥ 2 with qSOFA 0 → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        suspectedInfection: true,
        respiratoryRatePerMin: 18,
        systolicMmHg: 130,
        lactateMmolL: 3,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/lactate/);
  });

  it('septic shock (lactate > 4) emits extra critical card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 60,
        suspectedInfection: true,
        alteredMentation: true,
        respiratoryRatePerMin: 28,
        systolicMmHg: 80,
        lactateMmolL: 5,
      }),
    );
    expect(cards.length).toBe(2);
    expect(cards.filter((c) => c.indicator === 'critical').length).toBe(2);
    expect(cards.find((c) => /Septic shock/.test(c.summary))).toBeTruthy();
  });
});
