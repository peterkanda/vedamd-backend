import { describe, expect, it, beforeAll } from 'vitest';
import { ClinicalReferenceService, REFERENCE_DOMAINS } from '../src/modules/clinical-reference/clinical-reference.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): ClinicalReferenceService {
  const svc = new ClinicalReferenceService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('ClinicalReferenceService', () => {
  let svc: ClinicalReferenceService;
  beforeAll(() => {
    svc = makeService();
  });

  it('loads all four reference domains with records', () => {
    for (const domain of REFERENCE_DOMAINS) {
      const list = svc.list(domain);
      expect(list.length).toBeGreaterThan(0);
      for (const card of list) {
        expect(card.slug).toBeTruthy();
        expect(card.title).toBeTruthy();
        expect(card.category).toBeTruthy();
      }
    }
  });

  it('clinical-procedures uses only the four allowed categories', () => {
    const allowed = new Set(['nursing-care-plan', 'procedure', 'infection-prevention', 'fluid-electrolyte']);
    for (const c of svc.list('clinical-procedures')) {
      expect(allowed.has(c.category)).toBe(true);
    }
  });

  it('every detail card has sections with items XOR steps + a reference', () => {
    for (const domain of REFERENCE_DOMAINS) {
      for (const summary of svc.list(domain)) {
        const card = svc.get(domain, summary.slug);
        expect(card).not.toBeNull();
        expect(card!.references.length).toBeGreaterThanOrEqual(1);
        expect(card!.sections.length).toBeGreaterThan(0);
        for (const s of card!.sections) {
          const hasItems = Array.isArray(s.items) && s.items.length > 0;
          const hasSteps = Array.isArray(s.steps) && s.steps.length > 0;
          // exactly one of items / steps
          expect(hasItems !== hasSteps).toBe(true);
        }
      }
    }
  });

  it('filters by category and free-text query', () => {
    const all = svc.list('preventive-care');
    const oneCat = all[0]?.category;
    if (oneCat) {
      const filtered = svc.list('preventive-care', { category: oneCat });
      expect(filtered.every((c) => c.category === oneCat)).toBe(true);
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    }
    expect(svc.list('preventive-care', { q: 'zzzznomatch' }).length).toBe(0);
  });

  it('rejects an unknown domain via isDomain', () => {
    expect(svc.isDomain('clinical-procedures')).toBe(true);
    expect(svc.isDomain('not-a-domain')).toBe(false);
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('growth-development', 'no-such-card')).toBeNull();
  });
});
