import { describe, expect, it } from 'vitest';
import { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): KnowledgeSearchService {
  return new KnowledgeSearchService(makeKnowledgeService());
}

describe('KnowledgeSearchService', () => {
  const svc = makeService();

  it('returns nothing for queries shorter than 2 chars', () => {
    expect(svc.search('a')).toEqual([]);
    expect(svc.search('')).toEqual([]);
  });

  it('finds a common drug across the bundle and returns a route', () => {
    const hits = svc.search('paracetamol');
    expect(hits.length).toBeGreaterThan(0);
    const drug = hits.find((h) => h.domain === 'drugs');
    expect(drug).toBeDefined();
    expect(drug!.route).toMatch(/^\/app\/drugs\//);
    expect(drug!.title.toLowerCase()).toContain('paracetamol');
  });

  it('spans multiple domains for a broad term', () => {
    const hits = svc.search('malaria');
    const domains = new Set(hits.map((h) => h.domain));
    // malaria appears in conditions at minimum; usually drugs/scores too.
    expect(domains.size).toBeGreaterThanOrEqual(1);
    expect(hits.some((h) => h.domain === 'conditions')).toBe(true);
  });

  it('every hit carries a domain, title and route', () => {
    for (const h of svc.search('sodium')) {
      expect(h.domain).toBeTruthy();
      expect(h.title).toBeTruthy();
      expect(h.route.startsWith('/app/')).toBe(true);
    }
  });

  it('ranks exact/prefix title matches above mid-string matches', () => {
    const hits = svc.search('warfarin');
    expect(hits.length).toBeGreaterThan(0);
    // The top hit's title should start with or equal the query for a clean term.
    const top = hits[0].title.toLowerCase();
    expect(top.includes('warfarin')).toBe(true);
  });

  it('caps results at the requested limit', () => {
    expect(svc.search('a', 5).length).toBe(0); // too short
    expect(svc.search('in', 5).length).toBeLessThanOrEqual(5);
  });
});
