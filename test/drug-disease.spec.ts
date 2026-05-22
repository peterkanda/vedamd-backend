import { beforeEach, describe, expect, it } from 'vitest';
import { DrugDiseaseService } from '../src/modules/drug-disease/drug-disease.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): DrugDiseaseService {
  const svc = new DrugDiseaseService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('DrugDiseaseService', () => {
  let svc: DrugDiseaseService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open drug-disease catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(15);
    expect(list.map((i) => i.slug)).toContain('metformin--acute-kidney-injury');
  });

  it('returns full guidance from get()', () => {
    const i = svc.get('metformin--acute-kidney-injury');
    expect(i).not.toBeNull();
    expect(i!.severity).toBe('contraindicated');
    expect(i!.mechanism.length).toBeGreaterThan(0);
    expect(i!.recommendation.length).toBeGreaterThan(0);
    expect(i!.references.length).toBeGreaterThan(0);
  });

  it('filters by drug and by severity', () => {
    expect(svc.list({ drug: 'metformin' }).every((i) => i.drugSlug === 'metformin')).toBe(true);
    const ci = svc.list({ severity: 'contraindicated' });
    expect(ci.every((i) => i.severity === 'contraindicated')).toBe(true);
  });

  it('filters by condition slug', () => {
    const hf = svc.list({ condition: 'heart-failure-chronic' });
    expect(hf.length).toBeGreaterThan(0);
    expect(hf.every((i) => i.conditionSlug === 'heart-failure-chronic')).toBe(true);
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-interaction')).toBeNull();
  });
});
