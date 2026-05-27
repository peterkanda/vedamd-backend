import { beforeEach, describe, expect, it } from 'vitest';
import { PregnancyLactationService } from '../src/modules/pregnancy-lactation/pregnancy-lactation.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): PregnancyLactationService {
  const svc = new PregnancyLactationService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('PregnancyLactationService', () => {
  let svc: PregnancyLactationService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the PLLR catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(15);
    const slugs = list.map((r) => r.slug);
    // Anti-hallucination guard: highest-stakes records — teratogens, the
    // gold-standard safe alternatives, and the most-asked-about agents.
    for (const required of [
      'paracetamol-pllr',
      'ibuprofen-pllr',
      'warfarin-pllr',
      'enoxaparin-pllr',
      'ace-inhibitors-pllr',
      'methyldopa-pllr',
      'valproate-pllr',
      'methotrexate-pllr',
      'sertraline-pllr',
      'metformin-pllr',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('returns full PLLR narrative (pregnancy + lactation + reproductive) from get()', () => {
    const r = svc.get('valproate-pllr');
    expect(r).not.toBeNull();
    expect(r!.pregnancy.riskSummary.length).toBeGreaterThan(0);
    expect(r!.lactation.riskSummary.length).toBeGreaterThan(0);
    expect(r!.reproductive?.contraception).toMatch(/contracept/i);
    expect(r!.references.length).toBeGreaterThan(0);
  });

  it('reverse-lookup by drug slug works (integrator gives drug, gets PLLR)', () => {
    const r = svc.getByDrugSlug('warfarin');
    expect(r).not.toBeNull();
    expect(r!.slug).toBe('warfarin-pllr');
    expect(r!.pregnancyCompatibility).toBe('contraindicated');
    // Case-insensitive lookup
    expect(svc.getByDrugSlug('WARFARIN')?.slug).toBe('warfarin-pllr');
  });

  it('filters by pregnancy compatibility tier', () => {
    const contraindicated = svc.list({ pregnancy: 'contraindicated' });
    expect(contraindicated.length).toBeGreaterThan(0);
    for (const r of contraindicated) {
      expect(r.pregnancyCompatibility).toBe('contraindicated');
    }
    expect(contraindicated.map((r) => r.slug)).toEqual(
      expect.arrayContaining([
        'ibuprofen-pllr',
        'warfarin-pllr',
        'ace-inhibitors-pllr',
        'valproate-pllr',
        'methotrexate-pllr',
      ]),
    );
  });

  it('filters by lactation compatibility tier', () => {
    const preferred = svc.list({ lactation: 'preferred' });
    expect(preferred.map((r) => r.slug)).toEqual(
      expect.arrayContaining(['paracetamol-pllr', 'warfarin-pllr', 'enoxaparin-pllr']),
    );
  });

  it('legacy FDA letter category surfaced for back-compat but not as the headline field', () => {
    expect(svc.get('warfarin-pllr')!.legacyFdaCategory).toBe('X');
    expect(svc.get('paracetamol-pllr')!.legacyFdaCategory).toBe('B');
    // The summary headline drives clinical use — letter is reference only.
    expect(svc.get('warfarin-pllr')!.oneLiner).toMatch(/contraindicated/i);
  });

  it('returns null for an unknown slug / drug', () => {
    expect(svc.get('not-a-real-record')).toBeNull();
    expect(svc.getByDrugSlug('not-a-real-drug')).toBeNull();
  });
});
