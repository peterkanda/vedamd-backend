/**
 * Resolves inbound FHIR codings to the identifiers VedaMD content uses.
 *
 * Drug resolution order — most specific first, because a wrong match is
 * worse than no match (it can fire an interaction card about a drug the
 * patient is not on):
 *   1. RxNorm / ATC / SNOMED code recorded on the drug monograph
 *   2. Exact name match on slug, INN, or a registered trade name
 *   3. Leading-token match on the coding display / concept text, which
 *      is how OpenMRS, Bahmni and OpenEMR actually send drugs
 *      ("Amoxicillin 500mg Capsule" → amoxicillin)
 *
 * Step 3 is deliberately anchored to the START of the display string and
 * requires a whole-token hit. A substring scan matches "codeine" inside
 * "Co-codamol" and "nitrofurantoin" inside descriptive free text; both
 * produce confident cards about the wrong molecule.
 */

import type { FhirCodeableConcept, FhirCoding } from './fhir.types';

/** Terminology URIs an EMR may use for a drug coding. */
const RXNORM_SYSTEMS = ['rxnorm', 'nlm.nih.gov/research/umls/rxnorm'];
const ATC_SYSTEMS = ['whocc.no/atc', 'who.int/tools/atc', 'atc'];
const SNOMED_SYSTEMS = ['snomed.info/sct', 'snomed'];

export interface DrugIndexEntry {
  slug: string;
  inn: string;
  tradeNames: string[];
  atc: string[];
  rxnorm?: string;
  /**
   * DrugRecord types this as a single string, but the shipped bundle
   * carries `[]` on 124 records where no SNOMED code is assigned yet.
   * Accept both rather than crash the index on a content shape we do
   * not control — and note that KnowledgeService strips this field
   * entirely when SNOMED distribution is disabled for the tenant.
   */
  snomed?: string | string[];
}

/** Lowercase, strip punctuation, collapse whitespace. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalises a scalar-or-array code field into a list of trimmed codes. */
function toCodes(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((c) => String(c).trim()).filter(Boolean);
}

function systemMatches(system: string | undefined, needles: string[]): boolean {
  if (!system) return false;
  const s = system.toLowerCase();
  return needles.some((n) => s.includes(n));
}

/**
 * Index over the signed drug records, built once at module init.
 * Lookup is O(1) per coding — this sits on the CDS hot path.
 */
export class DrugCodeIndex {
  private readonly byRxNorm = new Map<string, string>();
  private readonly byAtc = new Map<string, string>();
  private readonly bySnomed = new Map<string, string>();
  private readonly byName = new Map<string, string>();
  /** Name tokens sorted longest-first, for leading-token matching. */
  private readonly names: { name: string; slug: string }[] = [];

  constructor(entries: DrugIndexEntry[]) {
    for (const d of entries) {
      if (d.rxnorm) this.byRxNorm.set(d.rxnorm.trim(), d.slug);
      for (const code of toCodes(d.snomed)) this.bySnomed.set(code, d.slug);
      for (const code of d.atc ?? []) {
        if (code) this.byAtc.set(code.trim().toUpperCase(), d.slug);
      }
      for (const name of [d.slug, d.inn, ...(d.tradeNames ?? [])]) {
        if (!name) continue;
        const n = norm(name);
        if (!n) continue;
        // First writer wins: slug and INN are registered before trade
        // names, so a trade name never shadows a molecule's own name.
        if (!this.byName.has(n)) this.byName.set(n, d.slug);
        this.names.push({ name: n, slug: d.slug });
      }
    }
    // Longest first so "amoxicillin clavulanate" beats "amoxicillin".
    this.names.sort((a, b) => b.name.length - a.name.length);
  }

  /** Resolves one CodeableConcept to a VedaMD drug slug, or null. */
  resolve(concept: FhirCodeableConcept | undefined): string | null {
    if (!concept) return null;

    for (const coding of concept.coding ?? []) {
      const hit = this.resolveCoding(coding);
      if (hit) return hit;
    }

    // Concept text, then any display, as the name-matching fallback.
    const texts = [concept.text, ...(concept.coding ?? []).map((c) => c.display)];
    for (const t of texts) {
      if (!t) continue;
      const hit = this.resolveName(t);
      if (hit) return hit;
    }
    return null;
  }

  private resolveCoding(coding: FhirCoding | undefined): string | null {
    const code = coding?.code?.trim();
    if (!code) return null;
    const system = coding?.system;

    if (systemMatches(system, RXNORM_SYSTEMS)) {
      return this.byRxNorm.get(code) ?? null;
    }
    if (systemMatches(system, ATC_SYSTEMS)) {
      return this.byAtc.get(code.toUpperCase()) ?? null;
    }
    if (systemMatches(system, SNOMED_SYSTEMS)) {
      return this.bySnomed.get(code) ?? null;
    }
    // Unknown/local system (OpenMRS concept UUIDs, OpenEMR drug ids):
    // the code itself is meaningless to us, so fall through to display
    // matching rather than guessing across terminologies.
    return null;
  }

  /**
   * Matches a human drug label. Anchored at the start of the string so
   * dose/form/route suffixes are ignored but unrelated text cannot
   * drag in a false positive.
   */
  resolveName(raw: string): string | null {
    const n = norm(raw);
    if (!n) return null;

    const exact = this.byName.get(n);
    if (exact) return exact;

    for (const { name, slug } of this.names) {
      if (n === name) return slug;
      if (n.startsWith(name + ' ')) return slug;
    }
    return null;
  }
}

/**
 * Condition code sets that map to the boolean sentinels the strategies
 * read. Only high-confidence, clinically unambiguous concepts are here:
 * an over-eager sentinel silently changes which rules fire.
 *
 * Matching is on ICD-10 prefix or SNOMED CT concept id, plus a
 * conservative text fallback for EMRs that send display text only.
 */
export interface ConditionSentinel {
  field: string;
  icd10Prefixes?: string[];
  snomed?: string[];
  /** Whole-phrase needles matched against lowercased display text. */
  text?: string[];
}

export const CONDITION_SENTINELS: ConditionSentinel[] = [
  {
    field: 'pregnant',
    icd10Prefixes: ['Z33', 'Z34', 'O09'],
    snomed: ['77386006', '102874004'],
    text: ['pregnancy', 'pregnant', 'gravid'],
  },
  {
    field: 'knownDiabetes',
    icd10Prefixes: ['E10', 'E11', 'E12', 'E13', 'E14'],
    snomed: ['73211009', '44054006', '46635009'],
    text: ['diabetes mellitus', 'type 2 diabetes', 'type 1 diabetes'],
  },
  {
    field: 'knownHtn',
    icd10Prefixes: ['I10', 'I11', 'I12', 'I13', 'I15'],
    snomed: ['38341003'],
    text: ['hypertension', 'hypertensive'],
  },
  {
    field: 'knownHivPositive',
    icd10Prefixes: ['B20', 'B21', 'B22', 'B23', 'B24', 'Z21'],
    snomed: ['86406008', '62479008'],
    text: ['hiv', 'human immunodeficiency virus'],
  },
  {
    field: 'knownAsthma',
    icd10Prefixes: ['J45', 'J46'],
    snomed: ['195967001'],
    text: ['asthma'],
  },
  {
    field: 'knownCopd',
    icd10Prefixes: ['J44'],
    snomed: ['13645005'],
    text: ['copd', 'chronic obstructive pulmonary'],
  },
  {
    field: 'knownEpilepsy',
    icd10Prefixes: ['G40'],
    snomed: ['84757009'],
    text: ['epilepsy'],
  },
  {
    field: 'sickleCellDisease',
    icd10Prefixes: ['D57'],
    snomed: ['127040003'],
    text: ['sickle cell'],
  },
  {
    field: 'cirrhosis',
    icd10Prefixes: ['K70.3', 'K74'],
    snomed: ['19943007'],
    text: ['cirrhosis'],
  },
  {
    field: 'hasAtrialFibrillation',
    icd10Prefixes: ['I48'],
    snomed: ['49436004'],
    text: ['atrial fibrillation'],
  },
  {
    field: 'knownAtheroscleroticCvd',
    icd10Prefixes: ['I20', 'I21', 'I22', 'I24', 'I25', 'I63', 'I65', 'I70', 'I73.9'],
    snomed: ['53741008', '22298006'],
    text: [
      'ischaemic heart disease',
      'ischemic heart disease',
      'myocardial infarction',
      'peripheral arterial disease',
    ],
  },
  {
    field: 'suspectedOrConfirmedTb',
    icd10Prefixes: ['A15', 'A16', 'A17', 'A18', 'A19'],
    snomed: ['56717001'],
    text: ['tuberculosis'],
  },
];

/** ICD-10 / SNOMED URIs seen in the wild for condition codings. */
const ICD10_SYSTEMS = ['icd-10', 'icd10', 'hl7.org/fhir/sid/icd-10'];

/**
 * Derives boolean sentinels from a patient's condition list.
 * Only ever sets a sentinel to `true` — absence of a coded condition is
 * not evidence of absence of the disease, so we never write `false`.
 */
export function deriveConditionSentinels(
  conditions: { concept?: FhirCodeableConcept }[],
): Record<string, true> {
  const out: Record<string, true> = {};

  for (const { concept } of conditions) {
    if (!concept) continue;
    const codings = concept.coding ?? [];
    const displayText = norm(
      [concept.text, ...codings.map((c) => c.display)].filter(Boolean).join(' '),
    );

    for (const sentinel of CONDITION_SENTINELS) {
      if (out[sentinel.field]) continue;

      const codeHit = codings.some((c) => {
        const code = c.code?.trim().toUpperCase();
        if (!code) return false;
        if (systemMatches(c.system, ICD10_SYSTEMS)) {
          return (sentinel.icd10Prefixes ?? []).some((p) => code.startsWith(p.toUpperCase()));
        }
        if (systemMatches(c.system, SNOMED_SYSTEMS)) {
          return (sentinel.snomed ?? []).includes(code);
        }
        return false;
      });

      const textHit =
        !codeHit && (sentinel.text ?? []).some((needle) => displayText.includes(norm(needle)));

      if (codeHit || textHit) out[sentinel.field] = true;
    }
  }

  return out;
}
