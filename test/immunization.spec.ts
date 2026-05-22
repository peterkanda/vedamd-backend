import { beforeEach, describe, expect, it } from 'vitest';
import { ImmunizationService } from '../src/modules/immunization/immunization.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): ImmunizationService {
  const svc = new ImmunizationService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('ImmunizationService', () => {
  let svc: ImmunizationService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open WHO EPI schedule from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(10);
    expect(list.map((e) => e.slug)).toContain('bcg');
  });

  it('returns full dose schedule from get()', () => {
    const e = svc.get('measles-containing');
    expect(e).not.toBeNull();
    expect(e!.doses.length).toBeGreaterThanOrEqual(2);
    expect(e!.targetDisease).toContain('Measles');
    expect(e!.references.length).toBeGreaterThan(0);
  });

  it('filters by target disease', () => {
    const polio = svc.list({ disease: 'polio' });
    expect(polio.map((e) => e.slug)).toContain('opv-polio');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-vaccine')).toBeNull();
  });
});
