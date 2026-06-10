import { describe, expect, it } from 'vitest';
import { BundlesService } from '../src/modules/bundles/bundles.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): BundlesService {
  const knowledge = makeKnowledgeService();
  return new BundlesService(knowledge);
}

describe('BundlesService.catalog', () => {
  const svc = makeService();

  it('returns the core bundle with real provenance + domains (no longer a stub)', async () => {
    const cat = await svc.catalog();
    expect(cat).toHaveLength(1);
    const b = cat[0];
    expect(b.id).toBe('vedamd-core');
    expect(b.version).toBeTruthy();
    expect(b.signedBy).toBeTruthy();
    expect(b.signatureAlgorithm).toBe('ed25519');
    expect(b.totalRecords).toBeGreaterThan(0);
    expect(Object.keys(b.recordsByClinicalDomain).length).toBeGreaterThan(0);
    expect(b.domains.length).toBeGreaterThan(0);
    expect(b.sizeBytes).toBeGreaterThan(0);
    expect(b.jurisdictions).toEqual(['KE']);
    // Every file entry carries a size + integrity hash.
    for (const d of b.domains) {
      expect(d.sizeBytes).toBeGreaterThan(0);
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('filters by domain (file)', async () => {
    const cat = await svc.catalog({ domain: 'conditions' });
    expect(cat).toHaveLength(1);
    expect(cat[0].domains.map((d) => d.domain)).toEqual(['conditions']);
  });

  it('returns empty for an unknown domain', async () => {
    expect(await svc.catalog({ domain: 'no-such-domain' })).toEqual([]);
  });

  it('returns the bundle for Kenya and empty for an un-localized country', async () => {
    expect(await svc.catalog({ country: 'KE' })).toHaveLength(1);
    expect(await svc.catalog({ country: 'UG' })).toEqual([]);
  });
});

describe('BundlesService.latest', () => {
  const svc = makeService();

  it('resolves the core bundle by id / version / "current"', async () => {
    expect((await svc.latest('vedamd-core'))?.id).toBe('vedamd-core');
    expect(await svc.latest('current')).not.toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await svc.latest('does-not-exist')).toBeNull();
  });
});
