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
    expect(list.length).toBeGreaterThanOrEqual(200);
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

  it('carries the priority-1 scoring tools added per the gap-analysis (anti-hallucination guard)', () => {
    const slugs = svc.list().map((s) => s.slug);
    // If a content edit accidentally drops one of these the test fails
    // loudly — these are the scores clinicians use daily.
    for (const required of [
      'pews',               // paediatric early warning
      'psofa',              // paediatric organ-failure score
      'ascvd-pce',          // US 10-year CVD risk (Pooled Cohort)
      'qrisk3',             // UK 10-year CVD risk
      'glasgow-blatchford', // upper GI bleed risk
      'spesi',              // simplified PE severity
      'apache-ii',          // ICU mortality
      'sirs-criteria',      // sepsis screen (legacy but still in EHRs)
      'nihss',              // stroke severity
      'mascc',              // febrile neutropenia risk
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('exposes formula-method scores (ASCVD, QRISK3, APACHE-II) without inventing point values', () => {
    // Formula-based scores must declare method "formula" — manual summation
    // is wrong and dangerous; the test fence-posts against silent re-coding.
    for (const slug of ['ascvd-pce', 'qrisk3', 'apache-ii']) {
      const s = svc.get(slug);
      expect(s).not.toBeNull();
      expect(s!.scoring.method).toBe('formula');
      expect(s!.scoring.notes).toBeDefined();
    }
  });
});
