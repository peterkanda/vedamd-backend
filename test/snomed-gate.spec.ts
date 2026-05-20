import { describe, expect, it } from 'vitest';
import { makeKnowledgeService } from './helpers/knowledge';

const SNOMED = 'http://snomed.info/sct';

/**
 * SNOMED CT redistribution requires an affiliate licence, so it is
 * hidden at runtime by default (CONTENT_SNOMED_ENABLED!=true) while the
 * data stays in the signed bundle as future provision. These tests pin
 * both states of the gate.
 */
describe('SNOMED CT runtime gate', () => {
  it('hides SNOMED everywhere when disabled (production default)', () => {
    const ks = makeKnowledgeService({ snomedEnabled: false });

    const term = ks.getTerminology();
    expect(term.codeSystems.find((cs) => cs.system === SNOMED)).toBeUndefined();
    // Other code systems remain available.
    expect(
      term.codeSystems.find((cs) => cs.system === 'http://hl7.org/fhir/sid/icd-10'),
    ).toBeTruthy();

    expect(ks.getConditions().every((c) => (c as { snomed?: unknown }).snomed === undefined)).toBe(
      true,
    );
    expect(ks.getDrugs().every((d) => (d as { snomed?: unknown }).snomed === undefined)).toBe(true);
    for (const r of ks.getCdsRules()) {
      expect((r.codings ?? []).some((c) => c.system === SNOMED)).toBe(false);
    }
  });

  it('surfaces SNOMED when enabled (licensed deployment)', () => {
    const ks = makeKnowledgeService({ snomedEnabled: true });
    const term = ks.getTerminology();
    expect(term.codeSystems.find((cs) => cs.system === SNOMED)).toBeTruthy();
    expect(ks.getConditions().some((c) => (c as { snomed?: unknown }).snomed !== undefined)).toBe(
      true,
    );
    expect(ks.getDrugs().some((d) => (d as { snomed?: unknown }).snomed !== undefined)).toBe(true);
  });
});
