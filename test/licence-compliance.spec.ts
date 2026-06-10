import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Licence-compliance guard (copyright register).
 *
 * Enforces the content-sourcing legal posture as code:
 *   - the source registry is well-formed (every source carries a tier,
 *     embeddable verdict, and a CitationLicence the citation schema knows),
 *   - every citation whose host maps to a registered source agrees with that
 *     source's licence (no relabelling a cite-only source as reusable).
 *
 * Policy is warn-now / enforce-later: MAX_LICENCE_MISMATCH is a CEILING that
 * only ratchets DOWN. It is 0 today (the bundle is clean) so any future
 * mislabel fails the build, while existing content is never broken.
 */

const BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');
const REGISTRY = resolve(process.cwd(), 'content/sources/registry.json');

const MAX_LICENCE_MISMATCH = 0;

const ALLOWED_LICENCE = new Set([
  'public-domain',
  'cc-by',
  'cc-by-nc-sa',
  'cc-by-nc-nd',
  'open-gov',
  'proprietary',
  'moh-restricted',
  'unknown',
]);
const ALLOWED_VERDICT = new Set(['yes', 'verify', 'cite-only']);

interface Source {
  id: string;
  tier: number;
  embeddable: string;
  citationLicence: string;
  countries: string[];
  hosts: string[];
  lastChecked: string;
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as { sources: Source[] };

const hostIndex = new Map<string, Source>();
for (const s of registry.sources) for (const h of s.hosts) hostIndex.set(h.toLowerCase(), s);

function sourceForUrl(url: string): Source | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  let candidate = host;
  while (candidate.includes('.')) {
    const hit = hostIndex.get(candidate);
    if (hit) return hit;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return hostIndex.get(candidate) ?? null;
}

function collectCitations(): Array<{ url?: string; licence?: string; label?: string }> {
  const out: Array<{ url?: string; licence?: string; label?: string }> = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'references' && Array.isArray(v))
          for (const c of v) if (c && typeof c === 'object') out.push(c);
        walk(v);
      }
    }
  };
  for (const f of readdirSync(BUNDLE)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    walk(JSON.parse(readFileSync(resolve(BUNDLE, f), 'utf8')));
  }
  return out;
}

describe('source registry', () => {
  it('is non-empty and every source is well-formed', () => {
    expect(registry.sources.length).toBeGreaterThan(10);
    const bad: string[] = [];
    for (const s of registry.sources) {
      if (!s.id) bad.push('missing id');
      if (![1, 2, 3].includes(s.tier)) bad.push(`${s.id}: tier ${s.tier}`);
      if (!ALLOWED_VERDICT.has(s.embeddable)) bad.push(`${s.id}: verdict ${s.embeddable}`);
      if (!ALLOWED_LICENCE.has(s.citationLicence))
        bad.push(`${s.id}: licence ${s.citationLicence}`);
      if (!Array.isArray(s.hosts) || s.hosts.length === 0) bad.push(`${s.id}: no hosts`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.lastChecked)) bad.push(`${s.id}: lastChecked`);
    }
    expect(bad).toEqual([]);
  });

  it('only tier-1 sources are ever embeddable=yes', () => {
    const wrong = registry.sources.filter((s) => s.embeddable === 'yes' && s.tier !== 1);
    expect(wrong.map((s) => s.id)).toEqual([]);
  });
});

describe('licence compliance', () => {
  const cites = collectCitations();

  it('citation licences agree with the registry (ratchet ≤ ceiling)', () => {
    const mismatches = cites.filter((c) => {
      if (!c.url || c.licence === undefined) return false;
      const src = sourceForUrl(c.url);
      return src !== null && c.licence !== src.citationLicence;
    });
    expect(mismatches.length).toBeLessThanOrEqual(MAX_LICENCE_MISMATCH);
  });
});
