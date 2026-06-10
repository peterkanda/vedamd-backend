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

/** How a source may be reused in the product. */
export type EmbedVerdict =
  /** Tier 1: public-domain / permissive — embed with attribution. */
  | 'yes'
  /** Tier 2: licence-uncertain — embed only after per-source verification. */
  | 'verify'
  /** Tier 3: NC/ND/proprietary/government — cite only, author original logic. */
  | 'cite-only';

export interface ContentSource {
  id: string;
  publisher: string;
  title: string;
  tier: 1 | 2 | 3;
  embeddable: EmbedVerdict;
  format: 'spec' | 'api' | 'bulk' | 'fhir-ig' | 'pdf' | 'html' | 'video';
  /** Human-readable licence (SPDX id or descriptive name). */
  spdxOrName: string;
  /** Nearest value on the shared CitationLicence enum, for the gate. */
  citationLicence: CitationLicence;
  /** ISO 3166-1 alpha-2 codes this source applies to, or ['*'] for global. */
  countries: string[];
  domains: string[];
  url: string;
  /** Citation hostnames that map back to this source. */
  hosts: string[];
  /** ISO date the licence/availability was last verified. */
  lastChecked: string;
  notes?: string;
}

export interface SourceRegistry {
  updated: string;
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
 * Index citation hosts → source. Longest host wins on suffix match so that
 * e.g. `bnf.nice.org.uk` maps to NICE rather than a bare `org.uk`.
 */
export function buildHostIndex(
  registry: SourceRegistry = loadSourceRegistry(),
): Map<string, ContentSource> {
  const index = new Map<string, ContentSource>();
  for (const src of registry.sources) {
    for (const host of src.hosts) index.set(host.toLowerCase(), src);
  }
  return index;
}

/** Resolve a citation URL's host to its registered source, if any. */
export function sourceForUrl(
  url: string,
  index: Map<string, ContentSource> = buildHostIndex(),
): ContentSource | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
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
