import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Cross-reference (referential integrity) guard.
 *
 * Records link to each other by slug: a drug-interaction names two drug
 * slugs, an antidote names the poisoning's drug, an immunization names its
 * vaccine drug, a notifiable disease names its condition, etc. When a linked
 * slug has no record, the client renders a cross-link that 404s on tap. This
 * test fails the build if any NEW dangling reference appears.
 *
 * KNOWN_GAPS captures the references that are currently dangling. Every entry
 * is an agent referenced ONLY as a link target — none has a drug monograph in
 * this content version, and none has authoritative structured data elsewhere
 * in the bundle to derive one from. They fall into three buckets:
 *   - essential medicines that warrant a real monograph (epinephrine,
 *     norepinephrine, dopamine, magnesium-sulfate, alteplase, …),
 *   - non-monograph agents / blood products / excipients (ethanol, albumin,
 *     calcium-carbonate, sodium-thiosulfate),
 *   - drug CLASSES, not single drugs, so a `drugs` monograph is the wrong
 *     model (monoamine-oxidase-inhibitor, selective-serotonin-reuptake-inhibitor).
 *
 * Filling these requires clinical authoring with citations (dosing,
 * contraindications, pregnancy) — deliberately NOT fabricated here. This guard
 * keeps the worklist exact and prevents the gap from growing.
 */

const BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');

/** Record fields that link to a DRUG record, by convention. */
const DRUG_REF_FIELDS = new Set([
  'drugSlug',
  'antidoteDrugSlug',
  'vaccineDrugSlug',
  'anticoagulantDrugSlug',
  'drugASlug',
  'drugBSlug',
]);
/** `slugA`/`slugB` mean drug slugs only in these pairwise domains. */
const PAIR_DOMAINS = new Set(['drug-interactions', 'iv-compatibility']);
/** Record fields that link to a CONDITION record. */
const CONDITION_REF_FIELDS = new Set(['conditionSlug']);

/** Drug slugs referenced by other records but having no monograph (tracked). */
const KNOWN_GAPS = new Set([
  'albumin',
  'alfentanil',
  'alteplase',
  'argatroban',
  'betrixaban',
  'bivalirudin',
  'calcium-carbonate',
  'danaparoid',
  'dipyridamole',
  'dopamine',
  'epinephrine',
  'ethanol',
  'fosphenytoin',
  'imipenem-cilastatin',
  'magnesium-sulfate',
  'methylprednisolone',
  'monoamine-oxidase-inhibitor',
  'nafcillin',
  'neomycin',
  'nicardipine',
  'nitroglycerin',
  'norepinephrine',
  'remifentanil',
  'selective-serotonin-reuptake-inhibitor',
  'sodium-thiosulfate',
  'sodium-valproate',
  'sufentanil',
]);

function loadDomains(): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const f of readdirSync(BUNDLE)) {
    if (!f.endsWith('.json') || f === 'manifest.json' || f === 'terminology.json') continue;
    const data = JSON.parse(readFileSync(resolve(BUNDLE, f), 'utf8'));
    if (Array.isArray(data)) out[f.replace(/\.json$/, '')] = data;
  }
  return out;
}

function slugSet(records: Array<Record<string, unknown>> | undefined): Set<string> {
  const s = new Set<string>();
  for (const r of records ?? []) if (typeof r.slug === 'string') s.add(r.slug);
  return s;
}

describe('bundle referential integrity', () => {
  const domains = loadDomains();
  const drugSlugs = slugSet(domains['drugs']);
  const conditionSlugs = slugSet(domains['conditions']);

  const brokenDrugRefs = new Set<string>();
  const brokenConditionRefs = new Set<string>();

  for (const [domain, records] of Object.entries(domains)) {
    for (const r of records) {
      for (const [key, value] of Object.entries(r)) {
        if (typeof value !== 'string' || value === '') continue;
        const isDrugRef =
          DRUG_REF_FIELDS.has(key) || (PAIR_DOMAINS.has(domain) && (key === 'slugA' || key === 'slugB'));
        if (isDrugRef && !drugSlugs.has(value)) brokenDrugRefs.add(value);
        else if (CONDITION_REF_FIELDS.has(key) && !conditionSlugs.has(value))
          brokenConditionRefs.add(value);
      }
    }
  }

  it('loads a populated bundle', () => {
    expect(drugSlugs.size).toBeGreaterThan(700);
    expect(conditionSlugs.size).toBeGreaterThan(700);
  });

  it('has NO dangling condition references', () => {
    expect([...brokenConditionRefs].sort()).toEqual([]);
  });

  it('has no dangling drug references outside the tracked KNOWN_GAPS', () => {
    const untracked = [...brokenDrugRefs].filter((s) => !KNOWN_GAPS.has(s)).sort();
    // A NEW broken drug link (typo or new record pointing at a missing drug).
    expect(untracked).toEqual([]);
  });

  it('KNOWN_GAPS lists only references that are still genuinely dangling', () => {
    // If a gap was filled (drug monograph added), drop it from KNOWN_GAPS.
    const stale = [...KNOWN_GAPS].filter((s) => drugSlugs.has(s) || !brokenDrugRefs.has(s)).sort();
    expect(stale).toEqual([]);
  });
});
