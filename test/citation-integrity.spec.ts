import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Citation integrity guard.
 *
 * Every clinical recommendation must be traceable to a graded, dated source.
 * This walks every `references[]` citation in the signed bundle and enforces:
 *   - 100% carry a valid A–D strength and a non-empty label (locks the
 *     current clean state against regression), and
 *   - the count of vague "latest/current edition" labels and of citations
 *     with NO year only ever goes DOWN (ratchet), so new content must be
 *     dated and editorial backfill is rewarded — without breaking the bundle
 *     on day one.
 * It also validates the optional provenance fields (year/edition/
 * accessedDate/identifier/sourceType/licence) wherever they are present.
 *
 * Baselines reflect the bundle at the time of writing; ratchet them down as
 * citations are dated. They are CEILINGS — the build fails if the gap grows.
 */

const BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');

// Ceilings (current state). Lower these as editorial dating proceeds.
const MAX_VAGUE_LATEST = 239;
const MAX_WITHOUT_YEAR = 7168;

const VAGUE = /\b(latest|current edition|latest edition|most recent)\b/i;
const YEAR = /(19|20)\d{2}/;
const ALLOWED_STRENGTH = new Set(['A', 'B', 'C', 'D']);
const ALLOWED_SOURCE_TYPE = new Set([
  'guideline',
  'drug-label',
  'formulary',
  'journal',
  'textbook',
  'reference',
  'consumer',
]);
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

interface Citation {
  label?: unknown;
  strength?: unknown;
  year?: unknown;
  edition?: unknown;
  accessedDate?: unknown;
  sourceType?: unknown;
  licence?: unknown;
}

/** Collect every object that is an element of a `references` array. */
function collectCitations(): Citation[] {
  const out: Citation[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'references' && Array.isArray(v)) {
          for (const c of v) if (c && typeof c === 'object') out.push(c as Citation);
        }
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

describe('citation integrity', () => {
  const cites = collectCitations();
  const label = (c: Citation) => (typeof c.label === 'string' ? c.label : '');

  it('loads a substantial citation set', () => {
    expect(cites.length).toBeGreaterThan(10000);
  });

  it('every citation has a non-empty label', () => {
    expect(cites.filter((c) => !label(c).trim()).length).toBe(0);
  });

  it('every citation has a valid A–D strength (no regression)', () => {
    const bad = cites.filter((c) => !ALLOWED_STRENGTH.has(c.strength as string));
    expect(bad.map(label).slice(0, 10)).toEqual([]);
    expect(bad.length).toBe(0);
  });

  it('vague "latest/current edition" labels only ratchet down', () => {
    const vague = cites.filter((c) => VAGUE.test(label(c))).length;
    expect(vague).toBeLessThanOrEqual(MAX_VAGUE_LATEST);
  });

  it('citations missing a year only ratchet down', () => {
    // A citation is "dated" if its label embeds a year OR it carries a
    // numeric `year` provenance field.
    const undated = cites.filter((c) => !YEAR.test(label(c)) && typeof c.year !== 'number').length;
    expect(undated).toBeLessThanOrEqual(MAX_WITHOUT_YEAR);
  });

  it('optional provenance fields, where present, are well-formed', () => {
    const bad: string[] = [];
    for (const c of cites) {
      if (c.year !== undefined && !(typeof c.year === 'number' && c.year >= 1900 && c.year <= 2100))
        bad.push(`year:${String(c.year)}`);
      if (c.accessedDate !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(String(c.accessedDate)))
        bad.push(`accessedDate:${String(c.accessedDate)}`);
      if (c.sourceType !== undefined && !ALLOWED_SOURCE_TYPE.has(c.sourceType as string))
        bad.push(`sourceType:${String(c.sourceType)}`);
      if (c.licence !== undefined && !ALLOWED_LICENCE.has(c.licence as string))
        bad.push(`licence:${String(c.licence)}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
