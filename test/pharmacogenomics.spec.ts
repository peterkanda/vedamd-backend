import { beforeEach, describe, expect, it } from 'vitest';
import { PharmacogenomicsService } from '../src/modules/pharmacogenomics/pharmacogenomics.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): PharmacogenomicsService {
  const svc = new PharmacogenomicsService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('PharmacogenomicsService', () => {
  let svc: PharmacogenomicsService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open pharmacogenomics catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.map((g) => g.slug)).toContain('hla-b5701-abacavir');
  });

  it('returns full phenotype guidance from get()', () => {
    const g = svc.get('cyp2c19-clopidogrel');
    expect(g).not.toBeNull();
    expect(g!.gene).toContain('CYP2C19');
    expect(g!.phenotypes.length).toBeGreaterThan(1);
    expect(g!.phenotypes.every((p) => p.recommendation.length > 0)).toBe(true);
    expect(g!.references.length).toBeGreaterThan(0);
  });

  it('filters by gene and by drug', () => {
    expect(svc.list({ gene: 'TPMT' }).map((g) => g.slug)).toContain('tpmt-nudt15-thiopurines');
    expect(svc.list({ drug: 'abacavir' }).map((g) => g.slug)).toContain('hla-b5701-abacavir');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-pgx')).toBeNull();
  });
});
