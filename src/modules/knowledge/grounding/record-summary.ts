import type { Topic } from './coverage';
import { TOPIC_KEYS } from './coverage';

interface FieldSpec {
  /** What the record is — always first; needed to cite it. */
  identity: string[];
  /** Fields a clinician acts on. A record missing any of these (or cut
   *  inside one) is not complete grounding. */
  core: string[];
  /** Useful background, first to go when space runs out. */
  context: string[];
}

/**
 * Per-domain field order. The old summaries used one field list for every
 * domain and cut the JSON at a fixed length, so immunisation records reached
 * the model as `{"slug": …}` alone and 488 of 855 drug records lost their
 * pregnancy field — while the answer was still labelled grounded.
 */
const DOMAIN_FIELDS: Record<string, FieldSpec> = {
  drugs: {
    identity: ['inn', 'drugClass'],
    core: ['dosing', 'contraindications', 'pregnancy', 'lactation', 'warnings'],
    context: ['indications', 'monitoring', 'adverseEffects', 'mechanism'],
  },
  conditions: {
    identity: ['title'],
    core: ['redFlags', 'management', 'presentation', 'diagnostics'],
    context: ['population'],
  },
  'drug-interactions': {
    identity: ['slugA', 'slugB'],
    core: ['severity', 'mechanism', 'management'],
    context: [],
  },
  immunization: {
    identity: ['vaccine', 'abbrev', 'targetDisease'],
    core: ['doses', 'catchUp', 'population', 'notes'],
    context: [],
  },
  antidotes: { identity: ['poison', 'antidote'], core: ['dosing'], context: ['mechanism'] },
  'pregnancy-lactation': {
    identity: ['drug'],
    core: [
      'pregnancyCompatibility',
      'lactationCompatibility',
      'oneLiner',
      'pregnancy',
      'lactation',
    ],
    context: ['reproductive'],
  },
  'symptom-triage': {
    identity: ['chiefComplaint'],
    core: ['redFlags', 'disposition', 'differential', 'initialInvestigations'],
    context: ['keyHistory', 'keyExam', 'oneLiner'],
  },
  toxidromes: {
    identity: ['name'],
    core: ['features', 'management', 'antidote', 'redFlags'],
    context: ['causativeAgents', 'oneLiner'],
  },
  'clinical-scores': {
    identity: ['title', 'abbrev'],
    core: ['items', 'scoring', 'interpretation'],
    context: ['purpose', 'caution'],
  },
  'drug-disease': {
    identity: ['drug', 'condition'],
    core: ['severity', 'recommendation', 'mechanism'],
    context: ['alternatives', 'monitoring'],
  },
  'hepatic-dose': {
    identity: ['drug'],
    core: ['worstClassDecision', 'guidance', 'acuteFailureGuidance'],
    context: ['monitoring', 'alternatives', 'oneLiner'],
  },
  'anticoagulant-reversal': {
    identity: ['anticoagulant'],
    core: ['protocols', 'pitfalls'],
    context: ['mechanism', 'oneLiner'],
  },
};

/**
 * Fields with no clinical meaning for a reader: identity, provenance, codings
 * and internal cross-links. Codings crowd real content out of the per-record
 * budget, and the model reasons over prose, not code systems. Everything else
 * is offered, so a new field or domain is grounded by default.
 */
const META = new Set([
  // Identity + provenance
  'slug',
  'references',
  'citations',
  'ruleVersion',
  'reviewStatus',
  'reviewers',
  'approvedAt',
  'lastReviewed',
  'evidenceLevel',
  'retrievedAt',
  'domains',
  // Codings
  'icd10',
  'icd11',
  'snomed',
  'loinc',
  'rxnorm',
  'atc',
  'setId',
  'splVersion',
  'rxcuiIngredients',
  'applicationNumbers',
  // Internal cross-links; the prose names the drug already.
  'drugSlug',
  'drugSlugs',
  'conditionSlug',
  'antidoteSlug',
  'antidoteDrugSlug',
  'anticoagulantDrugSlug',
  'vaccineDrugSlug',
  'drugASlug',
  'drugBSlug',
]);
const ABRIDGED_NOTE = 'in the VedaMD record but not shown here; do not treat as absent';

export interface RecordSummary {
  /** JSON object text; never cut inside a value. */
  text: string;
  /** Fields shown in full or in part. */
  included: string[];
  /** Fields in the record that did not fit. */
  omitted: string[];
  /** Every core field present in the record was shown in full. */
  coreComplete: boolean;
}

/** `"key":` as it appears in a record's JSON. Compiled once per key. */
const keyPatterns = new Map<string, RegExp>();
function keyPattern(key: string): RegExp {
  let re = keyPatterns.get(key);
  if (!re) {
    re = new RegExp(`"${key}"\\s*:`);
    keyPatterns.set(key, re);
  }
  return re;
}

/**
 * Summarise a record for a prompt within `budget` characters, field by field.
 *
 * Order: identity, then the fields the question asks about (its topics),
 * then the rest of the core fields, then context. Nothing is ever cut inside
 * a value: arrays lose whole trailing items, long strings are cut only at a
 * sentence boundary and marked, and anything that does not fit is named in
 * `_omitted` so the model knows it exists. The old fixed-length slice could
 * end on "6" of "60 mg" or turn "10-15 mg/kg" into "10".
 */
export function summarizeRecord(
  record: Record<string, unknown>,
  domain: string,
  opts: { budget: number; topics?: Iterable<Topic> },
): RecordSummary {
  const spec = DOMAIN_FIELDS[domain];
  const present = (k: string) => record[k] !== undefined && record[k] !== null && record[k] !== '';

  const topicKeys = new Set([...(opts.topics ?? [])].flatMap((t) => TOPIC_KEYS[t]));
  // A topic can live inside a field (a drug's renal bands are in `dosing`).
  const holdsCache = new Map<string, boolean>();
  const holdsTopic = (k: string) => {
    let holds = holdsCache.get(k);
    if (holds === undefined) {
      holds = topicKeys.has(k);
      if (!holds && topicKeys.size > 0) {
        const json = JSON.stringify(record[k]);
        holds = [...topicKeys].some((t) => keyPattern(t).test(json));
      }
      holdsCache.set(k, holds);
    }
    return holds;
  };

  const identity = spec
    ? spec.identity.filter(present)
    : ['title', 'name', 'inn', 'drug'].filter(present);
  const rest = Object.keys(record).filter(
    (k) => present(k) && !META.has(k) && !identity.includes(k),
  );
  const core = spec ? spec.core.filter(present) : rest;
  const context = spec
    ? [
        ...spec.context,
        ...rest.filter((k) => !spec.core.includes(k) && !spec.context.includes(k)),
      ].filter(present)
    : [];
  const ordered = [
    ...identity,
    ...[...core, ...context].filter((k) => holdsTopic(k)),
    ...core.filter((k) => !holdsTopic(k)),
    ...context.filter((k) => !holdsTopic(k)),
  ];

  const parts: string[] = [];
  const included: string[] = [];
  const omitted: string[] = [];
  const partial: string[] = [];
  // Reserve room for the closing brace and a possible _omitted list.
  let used = 2;
  const reserve = 120;

  for (const key of [...new Set(ordered)]) {
    const room = opts.budget - used - reserve - (parts.length ? 1 : 0);
    const full = `${JSON.stringify(key)}:${JSON.stringify(record[key])}`;
    if (full.length <= room) {
      parts.push(full);
      included.push(key);
      used += full.length + 1;
      continue;
    }
    const cut = fitValue(record[key], room - JSON.stringify(key).length - 1);
    if (cut !== null) {
      const piece = `${JSON.stringify(key)}:${cut}`;
      parts.push(piece);
      included.push(key);
      partial.push(key);
      used += piece.length + 1;
    } else {
      omitted.push(key);
    }
  }

  const notes = [...omitted, ...partial.map((k) => `${k} (rest)`)];
  if (notes.length)
    parts.push(`"_omitted":${JSON.stringify(`${notes.join(', ')} — ${ABRIDGED_NOTE}`)}`);

  return {
    text: `{${parts.join(',')}}`,
    included,
    omitted,
    coreComplete: core.every((k) => included.includes(k) && !partial.includes(k)),
  };
}

/** Largest whole-item / whole-sentence prefix of a value within `room`, as JSON. */
function fitValue(value: unknown, room: number): string | null {
  if (room < 40) return null;
  if (Array.isArray(value)) {
    const items: string[] = [];
    let len = 2;
    for (const item of value) {
      const s = JSON.stringify(item);
      if (len + s.length + 1 > room) break;
      items.push(s);
      len += s.length + 1;
    }
    return items.length ? `[${items.join(',')}]` : null;
  }
  if (typeof value === 'string') {
    const marker = ' …[continues]';
    const limit = room - marker.length - 2;
    if (limit < 30) return null;
    const head = value.slice(0, limit);
    const boundary = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '));
    if (boundary < 30) return null;
    return JSON.stringify(`${head.slice(0, boundary + 1)}${marker}`);
  }
  if (value && typeof value === 'object') {
    const entries: string[] = [];
    let len = 2;
    for (const [k, v] of Object.entries(value)) {
      const s = `${JSON.stringify(k)}:${JSON.stringify(v)}`;
      if (len + s.length + 1 > room) continue;
      entries.push(s);
      len += s.length + 1;
    }
    return entries.length ? `{${entries.join(',')}}` : null;
  }
  return null;
}
