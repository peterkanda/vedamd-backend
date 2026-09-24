import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
  'cc0',
  'cc-by',
  'cc-by-sa',
  'cc-by-nc',
  'cc-by-nc-sa',
  'cc-by-nd',
  'cc-by-nc-nd',
  'odbl',
  'nc-reproduce',
  'open-gov',
  'proprietary',
  'moh-restricted',
  'unknown',
]);
const ALLOWED_VERDICT = new Set(['yes', 'verify', 'cite-only']);
const ALLOWED_MODE = new Set(['adapt', 'verbatim', 'separate', 'cite-only']);

/**
 * Licences that permit each reuse mode under the VedaMD content licence
 * (CC BY-NC-SA 4.0). Adaptations must be relicensable CC BY-NC-SA, so only
 * licences without their own share-alike or no-derivatives terms qualify.
 */
const ADAPTABLE = new Set([
  'public-domain',
  'cc0',
  'cc-by',
  'cc-by-nc',
  'cc-by-nc-sa',
  'nc-reproduce',
  'open-gov',
]);
const PERMITS: Record<string, Set<string>> = {
  adapt: ADAPTABLE,
  verbatim: new Set([...ADAPTABLE, 'cc-by-nd', 'cc-by-nc-nd']),
  separate: new Set(['cc-by-sa', 'odbl']),
};

interface Source {
  id: string;
  tier: number;
  embeddable: string;
  reuseMode: string;
  commercialUse: boolean;
  citationLicence: string;
  licenceScope?: string;
  itemLicences?: string[];
  countries: string[];
  hosts: string[];
  urlPrefixes?: string[];
  lastChecked: string;
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as { sources: Source[] };

const hostIndex = new Map<string, Source>();
for (const s of registry.sources) {
  for (const h of s.hosts) hostIndex.set(h.toLowerCase(), s);
  for (const p of s.urlPrefixes ?? []) hostIndex.set(p.toLowerCase(), s);
}

function sourceForUrl(url: string): Source | null {
  let host: string;
  let hostPath: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    hostPath = host.replace(/^www\./, '') + parsed.pathname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, src] of hostIndex) {
    if (key.includes('/') && hostPath.startsWith(key)) return src;
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
      if (!ALLOWED_MODE.has(s.reuseMode)) bad.push(`${s.id}: reuseMode ${s.reuseMode}`);
      if (typeof s.commercialUse !== 'boolean') bad.push(`${s.id}: commercialUse`);
      if (!Array.isArray(s.hosts)) bad.push(`${s.id}: hosts`);
      if (s.hosts.length === 0 && !(s.urlPrefixes ?? []).length)
        bad.push(`${s.id}: no hosts or urlPrefixes`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.lastChecked)) bad.push(`${s.id}: lastChecked`);
    }
    expect(bad).toEqual([]);
  });

  it('only tier-1 sources are ever embeddable=yes', () => {
    const wrong = registry.sources.filter((s) => s.embeddable === 'yes' && s.tier !== 1);
    expect(wrong.map((s) => s.id)).toEqual([]);
  });

  it('embeddable sources say how to embed; cite-only sources are cite-only', () => {
    const wrong = registry.sources.filter(
      (s) =>
        (s.embeddable === 'yes' && s.reuseMode === 'cite-only') ||
        (s.embeddable === 'cite-only' && s.reuseMode !== 'cite-only'),
    );
    expect(wrong.map((s) => `${s.id}: ${s.embeddable}/${s.reuseMode}`)).toEqual([]);
  });

  it('every reuse mode is permitted by the source licence', () => {
    const wrong = registry.sources.filter(
      (s) =>
        s.licenceScope !== 'per-item' &&
        s.reuseMode !== 'cite-only' &&
        !PERMITS[s.reuseMode].has(s.citationLicence),
    );
    expect(wrong.map((s) => `${s.id}: ${s.reuseMode} with ${s.citationLicence}`)).toEqual([]);
  });

  it('per-item sources list their item licences and are never embeddable wholesale', () => {
    const bad: string[] = [];
    for (const s of registry.sources.filter((x) => x.licenceScope === 'per-item')) {
      const items = s.itemLicences ?? [];
      if (items.length === 0) bad.push(`${s.id}: no itemLicences`);
      if (!items.includes(s.citationLicence))
        bad.push(`${s.id}: citationLicence not in itemLicences`);
      if (items.some((l) => !ALLOWED_LICENCE.has(l))) bad.push(`${s.id}: unknown item licence`);
      if (s.embeddable === 'yes') bad.push(`${s.id}: per-item source marked embeddable=yes`);
    }
    expect(bad).toEqual([]);
  });

  it('no host or URL prefix is claimed by two sources (except the known DrugBank overlap)', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const s of registry.sources) {
      for (const key of [...s.hosts, ...(s.urlPrefixes ?? [])].map((k) => k.toLowerCase())) {
        if (seen.has(key) && key !== 'go.drugbank.com')
          dupes.push(`${key}: ${seen.get(key)} + ${s.id}`);
        seen.set(key, s.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('share-alike and restricted licences are never adapted', () => {
    const wrong = registry.sources.filter(
      (s) =>
        s.reuseMode === 'adapt' &&
        s.licenceScope !== 'per-item' &&
        [
          'cc-by-sa',
          'odbl',
          'cc-by-nd',
          'cc-by-nc-nd',
          'proprietary',
          'moh-restricted',
          'unknown',
        ].includes(s.citationLicence),
    );
    expect(wrong.map((s) => s.id)).toEqual([]);
  });
});

describe('licence compliance', () => {
  const cites = collectCitations();

  it('citation licences agree with the registry (ratchet ≤ ceiling)', () => {
    const mismatches = cites.filter((c) => {
      if (!c.url || c.licence === undefined) return false;
      const src = sourceForUrl(c.url);
      if (src === null) return false;
      return src.licenceScope === 'per-item'
        ? !(src.itemLicences ?? []).includes(c.licence)
        : c.licence !== src.citationLicence;
    });
    expect(mismatches.length).toBeLessThanOrEqual(MAX_LICENCE_MISMATCH);
  });
});

describe('reference-label licence gate (content/labels)', () => {
  const SCRIPT = resolve(process.cwd(), 'scripts/check-licence-compliance.js');

  function gate(files: Record<string, unknown[]>): { code: number; err: string } {
    const dir = mkdtempSync(join(tmpdir(), 'labels-'));
    try {
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(join(dir, name), JSON.stringify(body));
      }
      execFileSync('node', [SCRIPT, '--labels', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, err: '' };
    } catch (e) {
      const x = e as { status?: number; stderr?: Buffer };
      return { code: x.status ?? 1, err: String(x.stderr ?? '') };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const dailymed = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=x';
  const ppbPdf = 'https://products.pharmacyboardkenya.org/uploads/X.pdf';

  it('the committed labels directory passes', () => {
    expect(() => execFileSync('node', [SCRIPT], { stdio: 'pipe' })).not.toThrow();
  });

  it('accepts openFDA label text with a public-domain DailyMed citation', () => {
    const r = gate({
      'manufacturer-labels.json': [
        {
          slug: 'a',
          source: 'openfda',
          sections: { indications: { text: 't', truncated: false } },
          citation: { label: 'x', url: dailymed, licence: 'public-domain' },
        },
      ],
    });
    expect(r.code).toBe(0);
  });

  it('rejects stored text from a non-embeddable source (PPB)', () => {
    const r = gate({
      'ppb.json': [
        {
          slug: 'a',
          source: 'ppb-ke-smpc',
          sections: { x: { text: 't' } },
          citation: { label: 'x', url: ppbPdf },
        },
      ],
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('embeddable: cite-only');
  });

  it('rejects a relabelled citation licence', () => {
    const r = gate({
      'manufacturer-labels.json': [
        {
          slug: 'a',
          source: 'openfda',
          sections: {},
          citation: { label: 'x', url: dailymed, licence: 'proprietary' },
        },
      ],
    });
    expect(r.code).toBe(1);
  });

  it('allows link-only records from a cite-only source', () => {
    const r = gate({ 'ppb-smpc-links.json': [{ slug: 'a', title: 'X', url: ppbPdf }] });
    expect(r.code).toBe(0);
  });
});
