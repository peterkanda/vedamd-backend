import { describe, expect, it } from 'vitest';
import { TerminologyService } from '../src/modules/terminology/terminology.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): TerminologyService {
  const knowledge = makeKnowledgeService();
  const t = new TerminologyService(knowledge);
  t.onModuleInit();
  return t;
}

describe('TerminologyService — lookup ($lookup, FR-042)', () => {
  it('resolves a known ICD-10 code by short id', () => {
    const out = makeService().lookup('icd-10', 'I10');
    expect(out).not.toBeNull();
    expect(out!.code).toBe('I10');
    expect(out!.display).toMatch(/hypertension/i);
    expect(out!.system).toBe('http://hl7.org/fhir/sid/icd-10');
  });

  it('resolves the same code by canonical URI', () => {
    const out = makeService().lookup('http://hl7.org/fhir/sid/icd-10', 'I10');
    expect(out).not.toBeNull();
    expect(out!.code).toBe('I10');
  });

  it('returns null for unknown codes', () => {
    expect(makeService().lookup('icd-10', 'Z99.9999')).toBeNull();
  });

  it('returns null for unknown code systems', () => {
    expect(makeService().lookup('icd-99', 'I10')).toBeNull();
  });

  it('returns unit metadata for LOINC measurements', () => {
    const sbp = makeService().lookup('loinc', '8480-6');
    expect(sbp).not.toBeNull();
    expect(sbp!.display).toMatch(/Systolic/i);
    expect(sbp!.unit).toBe('mm[Hg]');
  });
});

describe('TerminologyService — validate-code ($validate-code, FR-042)', () => {
  it('accepts a valid (system, code) pair', () => {
    const r = makeService().validateCode('icd-10', 'I10');
    expect(r.result).toBe(true);
  });

  it('rejects an unknown code in a known system', () => {
    const r = makeService().validateCode('icd-10', 'Z99.9999');
    expect(r.result).toBe(false);
    expect(r.message).toMatch(/not in/i);
  });

  it('accepts a display that overlaps the canonical display', () => {
    const r = makeService().validateCode('icd-10', 'I10', 'Hypertension');
    expect(r.result).toBe(true);
  });

  it('rejects a wildly wrong display', () => {
    const r = makeService().validateCode('icd-10', 'I10', 'diabetes');
    expect(r.result).toBe(false);
    expect(r.display).toMatch(/hypertension/i);
  });
});

describe('TerminologyService — search (FR-044)', () => {
  it('finds hypertension across loaded systems', () => {
    const hits = makeService().search('hypertension');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].display.toLowerCase()).toContain('hyperten');
  });

  it('matches exact codes with the top score', () => {
    const hits = makeService().search('e11');
    expect(hits[0].code).toBe('E11');
    expect(hits[0].score).toBe(100);
  });

  it('matches by ATC code', () => {
    const hits = makeService().search('c09aa02');
    expect(hits[0].code).toBe('C09AA02');
  });

  it('respects the systemId filter', () => {
    const hits = makeService().search('a', 'aware', 50);
    for (const h of hits) expect(h.systemId).toBe('aware');
  });

  it('rejects ultra-short queries', () => {
    expect(makeService().search('').length).toBe(0);
    expect(makeService().search('a').length).toBe(0);
  });

  it('respects the limit', () => {
    expect(makeService().search('a', undefined, 3).length).toBeLessThanOrEqual(3);
  });
});

describe('TerminologyService — expand + listSystems', () => {
  it('expands the IMCI danger-signs value set', () => {
    const vs = makeService().expand('vedamd-imci-danger-signs');
    expect(vs).not.toBeNull();
    expect(vs!.total).toBeGreaterThanOrEqual(5);
    expect(vs!.concepts.find((c) => c.code === 'vomits-everything')).toBeTruthy();
  });

  it('returns null for unknown value-set ids', () => {
    expect(makeService().expand('does-not-exist')).toBeNull();
  });

  it('lists all loaded code systems with their concept counts', () => {
    const systems = makeService().listSystems();
    const ids = systems.map((s) => s.id).sort();
    expect(ids).toContain('icd-10');
    expect(ids).toContain('loinc');
    expect(ids).toContain('atc');
    expect(ids).toContain('aware');
    for (const s of systems) expect(s.conceptCount).toBeGreaterThan(0);
  });
});
