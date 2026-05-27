import { beforeEach, describe, expect, it } from 'vitest';
import { IvCompatibilityService } from '../src/modules/iv-compatibility/iv-compatibility.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): IvCompatibilityService {
  const svc = new IvCompatibilityService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('IvCompatibilityService', () => {
  let svc: IvCompatibilityService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the curated IV compatibility catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(20);
    const slugs = list.map((p) => p.slug);
    // Anti-hallucination guard: these are the documented-deaths and
    // major-mortality pairs. If any are accidentally removed, fail loudly.
    for (const required of [
      'ceftriaxone-calcium',
      'phenytoin-dextrose',
      'amiodarone-saline',
      'norepinephrine-bicarbonate',
      'calcium-bicarbonate',
      'vancomycin-piperacillin-tazobactam',
      'potassium-chloride-peripheral',
      'magnesium-calcium',
      'tpn-most-drugs',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('returns route context, notes, alternative and citations from get()', () => {
    const c = svc.get('ceftriaxone-calcium');
    expect(c).not.toBeNull();
    expect(c!.status).toBe('incompatible');
    expect(c!.routeContext.length).toBeGreaterThan(0);
    expect(c!.notes).toMatch(/neonate/i);
    expect(c!.alternative).toMatch(/cefotaxime/i);
    expect(c!.references.length).toBeGreaterThan(0);
  });

  it('filters by drug name OR drug slug (bidirectional lookup)', () => {
    expect(svc.list({ drug: 'norepinephrine' }).map((p) => p.slug)).toEqual(
      expect.arrayContaining(['norepinephrine-bicarbonate', 'norepinephrine-y-site-common']),
    );
    expect(svc.list({ drug: 'sodium-bicarbonate' }).length).toBeGreaterThanOrEqual(2);
  });

  it('filters by status', () => {
    expect(svc.list({ status: 'incompatible' }).length).toBeGreaterThan(0);
    expect(svc.list({ status: 'compatible' }).length).toBeGreaterThan(0);
    for (const p of svc.list({ status: 'incompatible' })) {
      expect(p.status).toBe('incompatible');
    }
  });

  it('filters by free-text query against agents + status + one-liner', () => {
    expect(svc.list({ q: 'crystalline' }).map((p) => p.slug)).toContain('ceftriaxone-calcium');
    expect(svc.list({ q: 'PVC' }).length).toBeGreaterThan(0);
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-pair')).toBeNull();
  });
});
