/**
 * Multi-country / multi-jurisdiction content model.
 *
 * VedaMD is Kenya-first but designed to scale across Africa. Following the
 * WHO SMART Guidelines pattern, content is layered: a country-specific
 * variant overrides a global/WHO BASE layer, and resolution falls back to the
 * base when no national variant exists. Crucially it NEVER substitutes one
 * country's national guideline for another — a missing Uganda variant falls
 * back to the WHO baseline (or nothing), never to the Kenyan one — because a
 * national dosing/eligibility recommendation is not safely portable.
 *
 * The field is optional and additive: existing (unlabelled) content is treated
 * as the platform default (Kenya), so nothing breaks. Adding a new country
 * later is "ship an overlay tagged with its countryCode", not a re-architecture.
 */

/** ISO 3166-1 alpha-2 country code (e.g. 'KE', 'UG', 'TZ', 'NG'), or the
 *  'WHO' sentinel for the global/baseline layer. */
export type Jurisdiction = string;

/** The global baseline layer — WHO generic guidance, used as the fallback. */
export const BASE_JURISDICTION: Jurisdiction = 'WHO';

/** Platform default for content that predates jurisdiction tagging. */
export const DEFAULT_JURISDICTION: Jurisdiction = 'KE';

/** Anything carrying an optional jurisdiction tag. */
export interface Jurisdictioned {
  /**
   * Country/authority this record applies to. Absent ⇒ DEFAULT_JURISDICTION
   * (the bundle is Kenya-first). Use BASE_JURISDICTION ('WHO') for generic
   * global content that any country can fall back to.
   */
  jurisdiction?: Jurisdiction;
}

/** Effective jurisdiction of a record (defaults to Kenya for back-compat). */
export function jurisdictionOf(rec: Jurisdictioned): Jurisdiction {
  return rec.jurisdiction ?? DEFAULT_JURISDICTION;
}

/**
 * Resolve the best variant for a requested country from a set of same-topic
 * candidates (e.g. all records sharing one slug across jurisdictions):
 *   1. exact country match (incl. unlabelled records when country === default),
 *   2. the WHO/base layer,
 *   3. otherwise null.
 * It deliberately does NOT fall back to a different country's national content.
 */
export function resolveForCountry<T extends Jurisdictioned>(
  candidates: T[],
  country: Jurisdiction,
): T | null {
  const exact = candidates.find((c) => jurisdictionOf(c) === country);
  if (exact) return exact;
  const base = candidates.find((c) => jurisdictionOf(c) === BASE_JURISDICTION);
  return base ?? null;
}

/**
 * Group a flat list of records by a topic key (default: `slug`) and resolve
 * each group for the requested country. Returns one record per topic that has
 * a country or base variant; topics with neither are dropped.
 */
export function resolveListForCountry<T extends Jurisdictioned & { slug?: string }>(
  records: T[],
  country: Jurisdiction,
  keyOf: (r: T) => string = (r) => r.slug ?? '',
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const resolved = resolveForCountry(group, country);
    if (resolved) out.push(resolved);
  }
  return out;
}
