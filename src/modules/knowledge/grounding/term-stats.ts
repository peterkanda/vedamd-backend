import { tokenize } from './terms';

/** Keys whose values are provenance or bookkeeping, not clinical content. */
const SKIP_KEYS = new Set([
  'references',
  'ruleVersion',
  'reviewStatus',
  'evidenceLevel',
  'reviewedBy',
  'lastReviewed',
  'codings',
  'snomed',
  'icd11',
  'atc',
  'rxnorm',
  'loinc',
]);

/** Fields that name what a record is about (drug, disease, vaccine …). */
const NAME_KEYS = [
  'slug',
  'title',
  'inn',
  'name',
  'drug',
  'disease',
  'poison',
  'antidote',
  'vaccine',
  'abbrev',
  'chiefComplaint',
  'analyte',
  'allergen',
  'targetDisease',
  'tradeNames',
  'slugA',
  'slugB',
];

export interface CorpusRecord {
  record: Record<string, unknown>;
}

/**
 * Document frequency and a name vocabulary over every searchable record.
 * Built once per loaded bundle; lets the gate tell a word that names
 * something specific ("zolmitriptan": 1 record) from background vocabulary
 * ("pregnancy": 20 % of records).
 */
export class BundleTermStats {
  readonly total: number;
  private readonly df = new Map<string, number>();
  private readonly names = new Set<string>();
  private readonly cache = new WeakMap<object, Set<string>>();

  constructor(records: Iterable<CorpusRecord>) {
    let n = 0;
    for (const { record } of records) {
      n += 1;
      for (const t of this.tokensOf(record)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      for (const key of NAME_KEYS) {
        for (const t of tokenize(flatten(record[key]))) this.names.add(t);
      }
    }
    this.total = n;
  }

  docFreq(term: string): number {
    return this.df.get(term) ?? 0;
  }

  isName(term: string): boolean {
    return this.names.has(term);
  }

  /** Every clinical-content token of a record (cached per record object). */
  tokensOf(record: Record<string, unknown>): Set<string> {
    const hit = this.cache.get(record);
    if (hit) return hit;
    const set = new Set(tokenize(flatten(record, true)));
    this.cache.set(record, set);
    return set;
  }
}

/** All string / number leaves of a value, space-joined. */
export function flatten(value: unknown, skipMeta = false): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (skipMeta && SKIP_KEYS.has(k)) continue;
        walk(child);
      }
    }
  };
  walk(value);
  return out.join(' ');
}
