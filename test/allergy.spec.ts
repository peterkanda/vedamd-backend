import { beforeEach, describe, expect, it } from 'vitest';
import { AllergyService } from '../src/modules/allergy/allergy.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): AllergyService {
  const svc = new AllergyService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('AllergyService', () => {
  let svc: AllergyService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open allergy cross-reactivity catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(60);
    expect(list.map((a) => a.slug)).toContain('penicillin-cephalosporin');
  });

  it('returns full guidance from get()', () => {
    const a = svc.get('penicillin-cephalosporin');
    expect(a).not.toBeNull();
    expect(a!.risk).toBe('low');
    expect(a!.mechanism.length).toBeGreaterThan(0);
    expect(a!.recommendation.length).toBeGreaterThan(0);
    expect(a!.references.length).toBeGreaterThan(0);
  });

  it('filters by risk and by drug slug', () => {
    expect(svc.list({ risk: 'negligible' }).every((a) => a.risk === 'negligible')).toBe(true);
    expect(svc.list({ drug: 'benzylpenicillin' }).map((a) => a.slug)).toContain(
      'penicillin-cephalosporin',
    );
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-allergy')).toBeNull();
  });
});
