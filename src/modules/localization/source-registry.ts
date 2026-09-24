import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CitationLicence } from '../../common/citation';
import { BASE_JURISDICTION, type Jurisdiction } from '../../common/jurisdiction';

/**
 * Content-source & licence registry.
 *
 * Operationalises the Kenya/SSA content-sourcing analysis: every upstream
 * source we might draw on is catalogued with a licence tier and an
 * `embeddable` verdict. Two consumers depend on this:
 *
 *   1. The ingestion engine (scripts/ingest-country-content.ts) — only
 *      sources with `embeddable: 'yes'` enter the EMBED lane; everything
 *      else becomes an authoring worklist item (cite, don't reproduce).
 *   2. The licence-compliance gate (scripts/check-licence-compliance.js) —
 *      maps every citation URL host back to its source and verifies the
 *      record's declared `licence` matches what the registry says, so a
 *      non-embeddable source can never be quietly relabelled as reusable.
 *
 * The single source of truth is content/sources/registry.json so that the
 * gate (Node) and the app (Nest) read identical data.
 */

/**
 * Whether a source may be embedded under VedaMD's content licence
 * (CC BY-NC-SA 4.0, content/LICENSE).
 */
export type EmbedVerdict =
  /** Tier 1: licence verified compatible — embed as `reuseMode` allows. */
  | 'yes'
  /** Licence unverified, or varies per item — check before embedding. */
  | 'verify'
  /** Not reusable even non-commercially — cite only, author original logic. */
  | 'cite-only';

/** What embedding may do with the source's expression. */
export type ReuseMode =
  /** Reproduce and adapt; adaptations are released CC BY-NC-SA 4.0. */
  | 'adapt'
  /** No-derivatives terms: reproduce unaltered excerpts only, never summarise. */
  | 'verbatim'
  /** Share-alike incompatible with NC-SA: ship as a separately licensed item. */
  | 'separate'
  /** Link and cite only. */
  | 'cite-only';

export interface ContentSource {
  id: string;
  publisher: string;
  title: string;
  tier: 1 | 2 | 3;
  embeddable: EmbedVerdict;
  reuseMode: ReuseMode;
  /** True if the licence also allows commercial use (serves a commercial-safe subset). */
  commercialUse: boolean;
  format: 'spec' | 'api' | 'bulk' | 'fhir-ig' | 'pdf' | 'html' | 'video' | 'dataset';
  /** Human-readable licence (SPDX id or descriptive name). */
  spdxOrName: string;
  /**
   * Nearest value on the shared CitationLicence enum, for the gate. For a
   * `per-item` source this is the usual item licence.
   */
  citationLicence: CitationLicence;
  /** `per-item`: each article/document carries its own licence (PMC, WHO IRIS). */
  licenceScope?: 'source' | 'per-item';
  /** For `per-item` sources, every licence an item may legitimately carry. */
  itemLicences?: CitationLicence[];
  /** ISO 3166-1 alpha-2 codes this source applies to, or ['*'] for global. */
  countries: string[];
  domains: string[];
  url: string;
  /** Citation hostnames that map back to this source. */
  hosts: string[];
  /**
   * Host + path prefixes (no scheme, no `www.`) that map to this source
   * ahead of host matching, for sources that share a host with another
   * (e.g. LactMed on ncbi.nlm.nih.gov/books).
   */
  urlPrefixes?: string[];
  /** ISO date the licence/availability was last verified. */
  lastChecked: string;
  notes?: string;
}

export interface SourceRegistry {
  updated: string;
  /** SPDX id of the licence VedaMD content is released under. */
  contentLicence: string;
  tiers: Record<string, string>;
  sources: ContentSource[];
}

let cached: SourceRegistry | null = null;

/** Load (and memoise) the registry from content/sources/registry.json. */
export function loadSourceRegistry(): SourceRegistry {
  if (cached) return cached;
  const file = resolve(process.cwd(), 'content/sources/registry.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as SourceRegistry;
  cached = parsed;
  return parsed;
}

/** Reset the memoised registry (tests). */
export function resetSourceRegistryCache(): void {
  cached = null;
}

/** A source applies to a country if it's global ('*') or lists that code. */
export function sourceAppliesToCountry(src: ContentSource, country: Jurisdiction): boolean {
  if (country === BASE_JURISDICTION) return src.countries.includes('*');
  return src.countries.includes('*') || src.countries.includes(country.toUpperCase());
}

/** Sources relevant to a country, split into the two ingestion lanes. */
export function lanesForCountry(
  country: Jurisdiction,
  registry: SourceRegistry = loadSourceRegistry(),
): { embed: ContentSource[]; worklist: ContentSource[] } {
  const applicable = registry.sources.filter((s) => sourceAppliesToCountry(s, country));
  return {
    embed: applicable.filter((s) => s.embeddable === 'yes'),
    worklist: applicable.filter((s) => s.embeddable !== 'yes'),
  };
}

/**
 * Whether a citation's declared licence agrees with its registered source:
 * the source licence, or for a `per-item` source any of its item licences.
 */
export function licenceAgrees(src: ContentSource, declared: CitationLicence): boolean {
  if (src.licenceScope === 'per-item') return (src.itemLicences ?? []).includes(declared);
  return declared === src.citationLicence;
}

/**
 * Index citation hosts → source. Longest host wins on suffix match so that
 * e.g. `bnf.nice.org.uk` maps to NICE rather than a bare `org.uk`.
 * `urlPrefixes` are indexed too (keys containing '/') and win over hosts.
 */
export function buildHostIndex(
  registry: SourceRegistry = loadSourceRegistry(),
): Map<string, ContentSource> {
  const index = new Map<string, ContentSource>();
  for (const src of registry.sources) {
    for (const host of src.hosts) index.set(host.toLowerCase(), src);
    for (const prefix of src.urlPrefixes ?? []) index.set(prefix.toLowerCase(), src);
  }
  return index;
}

/** Resolve a citation URL to its registered source, if any. */
export function sourceForUrl(
  url: string,
  index: Map<string, ContentSource> = buildHostIndex(),
): ContentSource | null {
  let host: string;
  let hostPath: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    hostPath = host.replace(/^www\./, '') + parsed.pathname.toLowerCase();
  } catch {
    return null;
  }
  // A registered path prefix beats any host match.
  for (const [key, src] of index) {
    if (key.includes('/') && hostPath.startsWith(key)) return src;
  }
  // Exact, then progressively strip subdomain labels (a.b.c → b.c → c).
  let candidate = host;
  while (candidate.includes('.')) {
    const hit = index.get(candidate);
    if (hit) return hit;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return index.get(candidate) ?? null;
}
