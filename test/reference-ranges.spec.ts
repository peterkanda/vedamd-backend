import { beforeEach, describe, expect, it } from 'vitest';
import { ReferenceRangesService } from '../src/modules/reference-ranges/reference-ranges.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): ReferenceRangesService {
  const svc = new ReferenceRangesService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('ReferenceRangesService', () => {
  let svc: ReferenceRangesService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open reference-ranges catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(25);
    expect(list.map((r) => r.slug)).toContain('potassium');
  });

  it('returns full bounds and units from get()', () => {
    const k = svc.get('potassium');
    expect(k).not.toBeNull();
    expect(k!.low).toBe(3.5);
    expect(k!.high).toBe(5.0);
    expect(k!.unit).toBe('mmol/L');
    expect(k!.references.length).toBeGreaterThan(0);
  });

  it('filters by category', () => {
    const vitals = svc.list({ category: 'vital-signs' });
    expect(vitals.length).toBeGreaterThan(0);
    expect(vitals.map((r) => r.slug)).toContain('respiratory-rate');
    expect(vitals.every((r) => r.slug !== 'potassium')).toBe(true);
  });

  it('supports open-ended ranges (null bound)', () => {
    const egfr = svc.get('egfr');
    expect(egfr).not.toBeNull();
    expect(egfr!.high).toBeNull();
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-analyte')).toBeNull();
  });
});
