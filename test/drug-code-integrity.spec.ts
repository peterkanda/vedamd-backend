import { beforeAll, describe, expect, it } from 'vitest';
import { DrugCodeIndex } from '../src/modules/cds/normalize/code-resolver';
import type { FhirCodeableConcept } from '../src/modules/cds/normalize/fhir.types';
import { loadRxNormQuarantine } from '../src/modules/cds/normalize/rxnorm-quarantine';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * Drug-code integrity, as the CDS normalizer runs it in production: the
 * signed drugs.json plus the deny-only RxNorm quarantine
 * (content/safety/rxnorm-quarantine.json, from `npm run audit:drug-rxnorm`).
 *
 * Ratchet: the ceilings below are today's counts of codes claimed by records
 * for different molecules. They may only go DOWN — lower them as the next
 * bundle version fixes codes. A rise means new content introduced a shared
 * code, which the resolver would silently refuse.
 */
const MAX_AMBIGUOUS = { rxnorm: 1, atc: 24, snomed: 48 };

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const code = (c: string, display?: string) =>
  ({ coding: [{ system: RXNORM, code: c, display }], text: display }) as FhirCodeableConcept;

let drugs: DrugRecord[];
let index: DrugCodeIndex;
const quarantine = loadRxNormQuarantine();

beforeAll(() => {
  drugs = makeKnowledgeService().getDrugs();
  index = new DrugCodeIndex(drugs as never, { quarantine: quarantine.entries });
});

describe('RxNorm quarantine file', () => {
  it('loads cleanly', () => {
    expect(quarantine.warning).toBeUndefined();
    expect(quarantine.entries.length).toBeGreaterThan(0);
  });

  it('names only (code, slug) claims that exist in the bundle — no stale entries', () => {
    const claims = new Set(
      drugs.filter((d) => d.rxnorm).map((d) => `${d.rxnorm!.trim()}|${d.slug}`),
    );
    const stale = quarantine.entries.filter((q) => !claims.has(`${q.code}|${q.slug}`));
    expect(stale).toEqual([]);
    expect(index.stats().quarantinedRxNorm).toBe(quarantine.entries.length);
  });
});

describe('DrugCodeIndex with quarantine', () => {
  it('keeps shared-across-molecule codes at or below the ratchet ceiling', () => {
    const { ambiguous } = index.stats();
    expect(ambiguous.rxnorm).toBeLessThanOrEqual(MAX_AMBIGUOUS.rxnorm);
    expect(ambiguous.atc).toBeLessThanOrEqual(MAX_AMBIGUOUS.atc);
    expect(ambiguous.snomed).toBeLessThanOrEqual(MAX_AMBIGUOUS.snomed);
  });

  it('never resolves a quarantined code on its own', () => {
    // 5552 is hydroxyurea's real code, stored on the hydroxyzine record.
    expect(index.resolve(code('5552'))).toBeNull();
    expect(index.resolve(code('5552', 'Hydroxyurea 500 mg capsule'))).toBe('hydroxyurea');
  });

  it('lets the correct owner of a code win once miscoded claims are removed', () => {
    // 703 = amiodarone. Last-writer-wins used to send it to mesalazine.
    expect(index.resolve(code('703'))).toBe('amiodarone');
    // 2191 = ceftazidime, formerly shared with cefotaxime/cefazolin/cefixime.
    expect(index.resolve(code('2191'))).toBe('ceftazidime');
    // 723 = amoxicillin, formerly resolved to amoxicillin-clavulanate.
    expect(index.resolve(code('723'))).toBe('amoxicillin');
  });

  it('still resolves correctly coded drugs', () => {
    expect(index.resolve(code('161'))).toBe('paracetamol');
    expect(index.resolve(code('6809', 'Metformin 500 mg tablet'))).toBe('metformin');
  });
});
