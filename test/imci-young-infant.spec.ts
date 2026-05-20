import { describe, expect, it } from 'vitest';
import { ImciYoungInfantStrategy } from '../src/modules/cds/strategies/imci-young-infant.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'imci-young-infant',
  hook: 'patient-view',
  type: 'imci-young-infant',
  services: ['vedamd-imci-young-infant'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO IMCI Chartbook 2014' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('ImciYoungInfantStrategy', () => {
  const s = new ImciYoungInfantStrategy();

  it('does not fire over 59 days', async () => {
    expect(await s.evaluate(RULE, req({ ageDays: 90, notFeedingWell: true }))).toEqual([]);
  });

  it('no signs → info home-care', async () => {
    const cards = await s.evaluate(RULE, req({ ageDays: 14 }));
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/No signs/i);
  });

  it('not feeding well → critical PSBI + weighted abx dose', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageDays: 10, notFeedingWell: true, weightKg: 3 }),
    );
    expect(cards[0].indicator).toBe('critical');
    // 50 × 3 = 150 mg ampicillin; 7.5 × 3 = 22.5 → rounds to 23 gentamicin (age 10d uses 7.5 mg/kg)
    expect(cards[0].detail).toMatch(/150 mg/);
    expect(cards[0].detail).toMatch(/23 mg/);
  });

  it('age <7 days uses 5 mg/kg gentamicin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageDays: 3, severeChestIndrawing: true, weightKg: 2.5 }),
    );
    expect(cards[0].indicator).toBe('critical');
    // 5 × 2.5 = 12.5 → 13 mg
    expect(cards[0].detail).toMatch(/13 mg/);
  });

  it('fever ≥37.5 → critical', async () => {
    const cards = await s.evaluate(RULE, req({ ageDays: 21, bodyTempC: 38.2 }));
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/fever/);
  });

  it('hypothermia <35.5 → critical', async () => {
    const cards = await s.evaluate(RULE, req({ ageDays: 5, bodyTempC: 34.8 }));
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/hypothermia/);
  });

  it('fast breathing not yet recounted → warning recount prompt', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageDays: 14, respiratoryRatePerMin: 64, recheckRrConfirmed: false }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/recount/i);
  });

  it('fast breathing confirmed on recheck → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageDays: 14, respiratoryRatePerMin: 65, recheckRrConfirmed: true }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('umbilical infection without severe signs → warning local bacterial infection', async () => {
    const cards = await s.evaluate(RULE, req({ ageDays: 12, umbilicusInfectedNotSkin: true }));
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/chlorhexidine/);
  });
});
