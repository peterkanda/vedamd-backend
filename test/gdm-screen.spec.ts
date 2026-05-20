import { describe, expect, it } from 'vitest';
import { GdmScreenStrategy } from '../src/modules/cds/strategies/gdm-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'gdm-screen',
  hook: 'patient-view',
  type: 'gdm-screen',
  services: ['vedamd-gdm-screen'],
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

describe('GdmScreenStrategy', () => {
  const s = new GdmScreenStrategy();

  it('silent when not pregnant', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30 }))).toEqual([]);
  });

  it('FPG ≥ 7.0 in pregnancy → overt diabetes critical card', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 8, fastingGlucoseMmolL: 7.5 }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/Overt diabetes/);
  });

  it('OGTT fasting 5.4 → GDM critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 26,
        ogtt75gFasting: 5.4,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/GDM diagnosed/);
    expect(cards[0].detail).toMatch(/MNT|medical nutrition/i);
  });

  it('GDM diagnosed + MNT failed → escalate to metformin / insulin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 28,
        ogtt75g2h: 9.0,
        mntTrialCompleted: true,
        smbgAboveTargetPercent: 30,
      }),
    );
    expect(cards[0].detail).toMatch(/metformin/i);
  });

  it('risk factor + 24–28 weeks + no OGTT → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        gestationalAgeWeeks: 26,
        previousGdm: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
  });

  it('no risk + 24–28 weeks → routine info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, gestationalAgeWeeks: 25 }),
    );
    expect(cards[0].indicator).toBe('info');
  });

  it('early pregnancy with no overt diabetes → silent', async () => {
    expect(
      await s.evaluate(RULE, req({ pregnant: true, gestationalAgeWeeks: 12 })),
    ).toEqual([]);
  });
});
