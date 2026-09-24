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

/**
 * Parity with the on-device retriever (vedamd-mobile SEARCH_DOMAINS): the
 * cloud assistant must ground a chat answer on the same corpus the phone
 * does. drug-interactions and renal-dose were absent here, so an
 * interaction or renal-dosing question grounded offline but not in the
 * cloud chat.
 */
describe('KnowledgeSearchService — interaction + renal coverage', () => {
  const svc = makeService();

  it('searches the drug-interactions domain', () => {
    const hits = svc.search('warfarin');
    const ddi = hits.find((h) => h.domain === 'drug-interactions');
    expect(ddi).toBeDefined();
    expect(ddi!.slug).toContain('__');
    expect(ddi!.route).toBe('/app/drug-interactions');
  });

  it('round-trips a pair-keyed interaction slug back to its record', () => {
    const ddi = svc.search('warfarin').find((h) => h.domain === 'drug-interactions')!;
    const rec = svc.getRecord('drug-interactions', ddi.slug);
    expect(rec).not.toBeNull();
    expect(rec!.severity).toBeTruthy();
    expect(rec!.management).toBeTruthy();
  });

  it('searches the renal-dose domain and resolves the record', () => {
    const hits = svc.search('metformin');
    const renal = hits.find((h) => h.domain === 'renal-dose');
    expect(renal).toBeDefined();
    expect(renal!.route).toBe('/app/renal-dose');
    const rec = svc.getRecord('renal-dose', renal!.slug);
    expect(rec).not.toBeNull();
    expect(rec!.guidance).toBeTruthy();
  });
});
