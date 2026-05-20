/**
 * Terminology service types (FR-040–FR-048).
 *
 * VedaMD ships a focused, in-memory subset of canonical code systems
 * needed by the CDS rules and drug records. Operators may, in future
 * versions, layer additional CodeSystems on top via the bundle —
 * this schema is structural and extensible.
 *
 * Code systems are URIs (e.g. `http://hl7.org/fhir/sid/icd-10`).
 * Codes within a system are case-sensitive strings exactly as the
 * source publishes them.
 */

export interface TerminologyConcept {
  code: string;
  display: string;
  /** Optional UCUM-style unit for measurement codes (LOINC). */
  unit?: string;
}

export interface CodeSystem {
  /** Canonical URI (e.g. `http://loinc.org`). */
  system: string;
  /** Short ID for /lookup queries (e.g. `icd-10`, `loinc`, `atc`, `aware`). */
  id: string;
  title: string;
  publisher: string;
  license: string;
  concepts: TerminologyConcept[];
}

export interface ValueSet {
  id: string;
  title: string;
  /** Canonical URI of the underlying code system this value set draws from. */
  system: string;
  concepts: TerminologyConcept[];
}

export interface TerminologyBundle {
  version: string;
  codeSystems: CodeSystem[];
  valueSets: ValueSet[];
}

export interface LookupResult {
  system: string;
  code: string;
  display: string;
  unit?: string;
  /** Source title for traceability. */
  source: string;
}

export interface ValidateCodeResult {
  result: boolean;
  message?: string;
  display?: string;
}

export interface SearchHit {
  system: string;
  systemId: string;
  code: string;
  display: string;
  /** Higher = better match. Computed as a simple weighted overlap score. */
  score: number;
}

export interface ExpandedValueSet {
  id: string;
  title: string;
  system: string;
  concepts: TerminologyConcept[];
  total: number;
}
