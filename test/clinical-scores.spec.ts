import { beforeEach, describe, expect, it } from 'vitest';
import { ClinicalScoresService } from '../src/modules/clinical-scores/clinical-scores.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): ClinicalScoresService {
  const svc = new ClinicalScoresService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('ClinicalScoresService', () => {
  let svc: ClinicalScoresService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open clinical-scores catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(10);
    expect(list.map((s) => s.slug)).toContain('cha2ds2-vasc');
  });

  it('returns summaries only from list(), full definition from get()', () => {
    const summary = svc.list().find((s) => s.slug === 'curb-65');
    expect(summary).toBeDefined();
    expect('items' in (summary as object)).toBe(false);

    const full = svc.get('curb-65');
    expect(full).not.toBeNull();
    expect(full!.items.length).toBe(5);
    expect(full!.scoring.max).toBe(5);
    expect(full!.interpretation.length).toBeGreaterThan(0);
    expect(full!.references.length).toBeGreaterThan(0);
  });

  it('filters by domain', () => {
    const cardio = svc.list({ domain: 'cardiology' });
    expect(cardio.map((s) => s.slug)).toContain('cha2ds2-vasc');
    expect(cardio.every((s) => s.slug !== 'apgar-score')).toBe(true);
  });

  it('filters by free-text query over title/abbreviation', () => {
    const hits = svc.list({ q: 'wells' });
    expect(hits.map((s) => s.slug)).toContain('wells-score-pe');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-score')).toBeNull();
  });
});
