import { describe, expect, it } from 'vitest';
import { PmtctStrategy } from '../src/modules/cds/strategies/pmtct.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'pmtct',
  hook: 'patient-view',
  type: 'pmtct',
  services: ['vedamd-pmtct'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO HIV' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('PmtctStrategy', () => {
  const s = new PmtctStrategy();

  it('silent for non-pregnant non-breastfeeding adult with documented status', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({ pregnant: false, breastfeeding: false, maternalHivStatus: 'negative' }),
      ),
    ).toEqual([]);
  });

  it('pregnant + status unknown → critical PITC', async () => {
    const cards = await s.evaluate(RULE, req({ pregnant: true, maternalHivStatus: 'unknown' }));
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/PITC today/);
  });

  it('pregnant + HIV-positive + not on ART → critical TLD same day', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ pregnant: true, maternalHivStatus: 'positive', onArt: false }),
    );
    expect(cards[0].summary).toMatch(/TLD same day/);
    expect(cards[0].detail).toMatch(/tenofovir 300 mg/);
  });

  it('VL > 1000 on ART → critical, escalate', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        maternalHivStatus: 'positive',
        onArt: true,
        viralLoadCopiesMl: 5000,
      }),
    );
    expect(cards[0].summary).toMatch(/not suppressed/);
  });

  it('suppressed → warning, mixed feeding triggers counselling', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        breastfeeding: true,
        maternalHivStatus: 'positive',
        onArt: true,
        viralLoadCopiesMl: 50,
        infantFeeding: 'mixed',
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/mixed feeding/i);
  });

  it('HIV-exposed infant without prophylaxis → critical NVP', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        breastfeeding: true,
        maternalHivStatus: 'positive',
        onArt: true,
        viralLoadCopiesMl: 30,
        infantHivExposed: true,
        infantAgeWeeks: 2,
      }),
    );
    const infantCard = cards.find((c) => /HIV-exposed infant/.test(c.summary));
    expect(infantCard).toBeTruthy();
    expect(infantCard!.detail).toMatch(/nevirapine/i);
  });

  it('negative + serodiscordant → warning PrEP', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        pregnant: true,
        maternalHivStatus: 'negative',
        serodiscordantPartner: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].detail).toMatch(/PrEP/);
  });
});
