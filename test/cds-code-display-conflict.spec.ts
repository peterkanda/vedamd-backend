import { describe, expect, it, beforeAll } from 'vitest';
import { DrugCodeIndex } from '../src/modules/cds/normalize/code-resolver';
import { makeKnowledgeService } from './helpers/knowledge';
import type { FhirCodeableConcept } from '../src/modules/cds/normalize/fhir.types';

/**
 * Guards the code-vs-label cross-check.
 *
 * content/safety/rxnorm-code-audit.md found 66 drug records carrying an
 * rxnorm code that belongs to a different molecule. Codes are matched
 * before names, so an EMR sending a correct prescription — right code AND
 * right display — resolved to the wrong drug, silently, with the display
 * that would have caught it discarded: a patient on apixaban had cards
 * evaluated against latanoprost.
 *
 * Correcting the codes needs clinical review and a re-signed bundle. Until
 * then the resolver refuses when its two identifiers disagree, per the
 * rule the module was written to: a wrong match is worse than no match.
 */

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

let index: DrugCodeIndex;
beforeAll(() => {
  index = new DrugCodeIndex(makeKnowledgeService().getDrugs() as never);
});

function concept(code: string, display?: string): FhirCodeableConcept {
  return {
    coding: [{ system: RXNORM, code, display }],
    text: display,
  } as FhirCodeableConcept;
}

describe('DrugCodeIndex — code/label disagreement', () => {
  // Each pair is a real miscoded record from the audit: the code stored on
  // a VedaMD record actually belongs to the molecule in `display`, and no
  // other record claims it — so the code alone still resolves (to the wrong
  // drug) and only the label can catch it.
  const conflicts: [string, string][] = [
    ['5552', 'hydroxyurea 500 MG Oral Capsule'],
    ['3008', 'cyclosporine 100 MG capsule'],
    ['4452', 'fludrocortisone 0.1 MG tablet'],
  ];

  for (const [code, display] of conflicts) {
    it(`refuses rather than resolving "${display}" to the miscoded record`, () => {
      const viaCode = index.resolve(concept(code));
      const viaName = index.resolveName(display);

      // Precondition: this really is a disagreement, not a stale fixture.
      expect(viaCode).toBeTruthy();
      expect(viaName).toBeTruthy();
      expect(viaName).not.toBe(viaCode);

      // The whole concept must resolve to nothing rather than to the
      // molecule the code wrongly points at.
      expect(index.resolve(concept(code, display))).toBeNull();
    });
  }

  // A second, distinct defect: some rxnorm codes are claimed by records for
  // DIFFERENT molecules. The index used to be last-writer-wins, so the code
  // silently resolved to whichever record was indexed last (703, amiodarone's
  // real code, resolved to mesalazine). A code shared across molecules is now
  // not resolved by code at all: alone it gives no match, and with a label
  // the label decides — never the arbitrary last writer.
  const collisions: [string, string, string, string][] = [
    // [code, display, drug the display names, drug last-writer-wins returned]
    ['703', 'amiodarone 200 MG Oral Tablet', 'amiodarone', 'mesalazine'],
    ['2191', 'ceftazidime 1 g injection', 'ceftazidime', 'cefixime'],
    ['1364430', 'apixaban 5 MG Oral Tablet', 'apixaban', 'latanoprost'],
    ['723', 'Amoxicillin 500 mg capsule', 'amoxicillin', 'amoxicillin-clavulanate'],
    ['6915', 'Metoclopramide 10 mg tablet', 'metoclopramide', 'mifepristone'],
    ['7393', 'Nevirapine 200 mg tablet', 'nevirapine', 'nicotinamide'],
  ];

  for (const [code, display, named, formerlyWrong] of collisions) {
    it(`never lets shared code ${code} resolve "${display}" to ${formerlyWrong}`, () => {
      expect(index.resolve(concept(code))).toBeNull();
      expect(index.resolve(concept(code, display))).toBe(named);
    });
  }

  it('resolves a code shared only by variants of one molecule to the base record', () => {
    // aciclovir and aciclovir-iv both carry 281 — same molecule, not ambiguous.
    expect(index.resolve(concept('281'))).toBe('aciclovir');
  });

  it('still resolves when code and label agree', () => {
    // paracetamol/161 is self-consistent in the bundle and correct in RxNorm.
    expect(index.resolve(concept('161', 'Paracetamol 500 mg tablet'))).toBe('paracetamol');
    expect(index.resolve(concept('6809', 'Metformin 500 mg tablet'))).toBe('metformin');
  });

  it('still trusts the code when no label is supplied', () => {
    expect(index.resolve(concept('5552'))).toBe(index.resolve(concept('5552')));
    expect(index.resolve(concept('5552'))).toBeTruthy();
  });

  it('still trusts the code when the label names no known drug', () => {
    // Local EMR shorthand that matches nothing — no second opinion, so the
    // code stands rather than being discarded.
    expect(index.resolve(concept('5552', 'TAB HYDROX 25 (ward stock)'))).toBeTruthy();
  });

  it('falls back to the label when the code is unknown', () => {
    expect(index.resolve(concept('999999999', 'Amoxicillin 500 mg capsule'))).toBe('amoxicillin');
  });
});
