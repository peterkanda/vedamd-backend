#!/usr/bin/env ts-node
/**
 * Manufacturer label ingestion (US FDA labels via openFDA + RxNav).
 *
 *   npm run labels:ingest                        # all drugs (resumes from cache)
 *   npm run labels:ingest -- --limit 25          # first 25 drugs
 *   npm run labels:ingest -- --slug amoxicillin --slug metformin
 *   npm run labels:ingest -- --refresh           # ignore per-drug cache
 *
 * Writes DRAFT reference content outside the signed bundle:
 *   content/labels/manufacturer-labels.json   one record per drug + route
 *   content/labels/match-report.md            matched / unmatched / pending
 *
 * Licensing: only registry sources with `embeddable: yes` may contribute label
 * text (docs/manufacturer-label-licensing.md). This script refuses to run if
 * `openfda` is not embeddable. Official APIs only — no website scraping.
 *
 * Rate limits: openFDA allows 240 req/min and 1,000 req/day per IP without a
 * key (120,000/day with OPENFDA_API_KEY). On a daily-quota 429 the run stops
 * cleanly, writes what it has, and lists the remaining drugs as pending; the
 * per-drug cache in .cache/labels/ makes the next run resume.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DrugRecord, ManufacturerLabel } from '../src/modules/drugs/drugs.types';
import {
  LABEL_SOURCE_FIELDS,
  buildLabelRecord,
  filterLabelsByConcentration,
  filterLabelsByRoute,
  parseInnComponents,
  selectReferenceLabels,
  type CountryProfiles,
  type OpenFdaLabel,
} from './lib/manufacturer-labels';
import {
  CACHE_DIR,
  QuotaExhausted,
  getJson,
  ingredientForName,
  relatedIngredients,
  rxnav,
  withSalts,
  type Ingredient,
} from './lib/rxnav-client';

const ROOT = resolve(__dirname, '..');
const DRUGS = resolve(ROOT, 'content/bundles/v0.1.0/drugs.json');
const REGISTRY = resolve(ROOT, 'content/sources/registry.json');
const PROFILES = resolve(ROOT, 'content/sources/country-profiles.json');
const OUT_DIR = resolve(ROOT, 'content/labels');
/** Bump when the selection/query logic changes so stale per-drug caches are ignored. */
const CACHE_SCHEMA = 1;

// ─── CLI ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const slugs = argv.flatMap((a, i) => (a === '--slug' ? [argv[i + 1]] : []));
const limit = opt('--limit') ? Number(opt('--limit')) : undefined;
const concurrency = Number(opt('--concurrency') ?? 4);
const refresh = flag('--refresh');
const apiKey = process.env.OPENFDA_API_KEY;

type Resolution =
  | { ok: true; ingredients: Ingredient[]; via: 'name' | 'rxnorm-code' }
  | { ok: false; reason: 'unresolved-ingredient' | 'rxnorm-mismatch'; detail: string };

async function resolveDrug(drug: DrugRecord): Promise<Resolution> {
  const components = parseInnComponents(drug.inn);
  const byName = await Promise.all(components.map((c) => ingredientForName(c)));
  const nameOk = byName.every(Boolean);
  const nameSet = nameOk ? [...new Set(byName.map((i) => i!.rxcui))].sort() : [];

  let codeIngs: { rxcui: string; name: string }[] = [];
  if (drug.rxnorm) {
    const props = (await rxnav(`rxcui/${encodeURIComponent(drug.rxnorm)}/properties.json`))
      ?.properties;
    codeIngs =
      props?.tty === 'IN'
        ? [{ rxcui: drug.rxnorm, name: props.name }]
        : await relatedIngredients(drug.rxnorm);
  }
  const codeSet = [...new Set(codeIngs.map((i) => i.rxcui))].sort();

  if (nameOk && codeSet.length && nameSet.join() !== codeSet.join()) {
    // The record's RxNorm code and its INN disagree — never guess which is right.
    return {
      ok: false,
      reason: 'rxnorm-mismatch',
      detail: `INN → ${byName.map((i) => i!.name).join(' + ')}; rxnorm ${drug.rxnorm} → ${codeIngs.map((i) => i.name).join(' + ') || 'no ingredient'}`,
    };
  }
  if (nameOk) {
    const uniq = [...new Map(byName.map((i) => [i!.rxcui, i!])).values()];
    return { ok: true, ingredients: await Promise.all(uniq.map(withSalts)), via: 'name' };
  }
  if (codeSet.length) {
    return {
      ok: true,
      ingredients: await Promise.all(codeIngs.map(withSalts)),
      via: 'rxnorm-code',
    };
  }
  return {
    ok: false,
    reason: 'unresolved-ingredient',
    detail: `no RxNorm ingredient for: ${components.filter((_, i) => !byName[i]).join(', ')}`,
  };
}

// ─── openFDA label search ──────────────────────────────────────────────────

const NO_REPACKAGERS = '_missing_:openfda.original_packager_product_ndc';
const q = (s: string) => `"${s.toUpperCase().replace(/"/g, '')}"`;

async function searchLabels(search: string): Promise<{ total: number; results: OpenFdaLabel[] }> {
  const params = new URLSearchParams({ search, limit: '100', sort: 'effective_time:desc' });
  if (apiKey) params.set('api_key', apiKey);
  const data = (await getJson(`https://api.fda.gov/drug/label.json?${params}`, 'openfda')) as any;
  if (!data) return { total: 0, results: [] };
  return { total: data.meta?.results?.total ?? 0, results: data.results ?? [] };
}

/** Both passes: everything (newest 100), plus NDA/BLA-only when truncated so
 *  innovator labels are never crowded out by generics. */
async function searchBoth(base: string): Promise<OpenFdaLabel[]> {
  const all = await searchLabels(`${base} AND ${NO_REPACKAGERS}`);
  if (all.total <= all.results.length) return all.results;
  const innovator = await searchLabels(
    `${base} AND ${NO_REPACKAGERS} AND openfda.application_number:(NDA* BLA*)`,
  );
  return [...innovator.results, ...all.results];
}

async function candidateLabels(ings: Ingredient[]): Promise<OpenFdaLabel[]> {
  if (ings.length === 1) {
    const names = [ings[0].name, ...ings[0].saltNames];
    const exact = await searchBoth(`openfda.generic_name.exact:(${names.map(q).join(' ')})`);
    if (exact.length) return exact;
    // Fallback: substance phrase match; keep only labels whose single
    // substance is this ingredient (optionally as a salt).
    const loose = await searchBoth(`openfda.substance_name:${q(ings[0].name)}`);
    const upper = names.map((n) => n.toUpperCase());
    return loose.filter((l) => {
      const s = l.openfda.substance_name ?? [];
      return s.length === 1 && upper.some((n) => s[0] === n || s[0].startsWith(n + ' '));
    });
  }
  return searchBoth(ings.map((i) => `openfda.substance_name:${q(i.name)}`).join(' AND '));
}

// ─── Per-drug pipeline with cache ──────────────────────────────────────────

type Outcome =
  | { status: 'matched'; labels: ManufacturerLabel[]; via: string }
  | {
      status: 'no-us-label' | 'unresolved-ingredient' | 'rxnorm-mismatch' | 'error';
      detail: string;
    }
  | { status: 'pending'; detail: string };

/** Trim a label to what buildLabelRecord reads, to keep the cache small. */
function trimLabel(l: OpenFdaLabel, withSections: boolean): OpenFdaLabel {
  const keep: OpenFdaLabel = {
    set_id: l.set_id,
    version: l.version,
    effective_time: l.effective_time,
    openfda: l.openfda,
  };
  if (withSections) {
    for (const k of LABEL_SOURCE_FIELDS) if (l[k] !== undefined) keep[k] = l[k];
  }
  return keep;
}

async function processDrug(
  drug: DrugRecord,
  profiles: CountryProfiles,
  retrievedAt: string,
): Promise<Outcome> {
  const outcome = await lookupDrug(drug, profiles, retrievedAt);
  if (outcome.status !== 'matched') return outcome;
  // Applied after the cache so route rules can change without re-querying openFDA.
  const labels = filterLabelsByConcentration(drug, filterLabelsByRoute(drug, outcome.labels));
  if (labels.length) return { ...outcome, labels };
  return {
    status: 'no-us-label',
    detail: `US labels exist only for other routes or strengths (${outcome.labels.map((l) => l.routes.join('+')).join('; ')})`,
  };
}

async function lookupDrug(
  drug: DrugRecord,
  profiles: CountryProfiles,
  retrievedAt: string,
): Promise<Outcome> {
  const cacheFile = resolve(CACHE_DIR, 'drugs', `${drug.slug}.json`);
  if (!refresh && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (cached.schema === CACHE_SCHEMA) return cached.outcome as Outcome;
  }
  const save = (outcome: Outcome) => {
    writeFileSync(cacheFile, JSON.stringify({ schema: CACHE_SCHEMA, outcome }));
    return outcome;
  };
  try {
    const res = await resolveDrug(drug);
    if (!res.ok) return save({ status: res.reason, detail: res.detail });
    const candidates = await candidateLabels(res.ingredients);
    const selected = selectReferenceLabels(candidates, res.ingredients.length);
    if (!selected.length) {
      return save({
        status: 'no-us-label',
        detail: `${res.ingredients.map((i) => i.name).join(' + ')} (${candidates.length} candidate labels, none single-matching)`,
      });
    }
    const labels = selected.map((s) =>
      buildLabelRecord({
        drug,
        rxcuiIngredients: res.ingredients.map((i) => i.rxcui),
        selected: {
          primary: trimLabel(s.primary, true),
          alternates: s.alternates.map((a) => trimLabel(a, false)),
        },
        profiles,
        retrievedAt,
      }),
    );
    return save({ status: 'matched', labels, via: res.via });
  } catch (e) {
    if (e instanceof QuotaExhausted) throw e;
    return { status: 'error', detail: (e as Error).message }; // not cached: retried next run
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const openfda = registry.sources.find((s: { id: string }) => s.id === 'openfda');
  if (openfda?.embeddable !== 'yes') {
    console.error('Refusing to ingest: registry source "openfda" is not embeddable: yes.');
    process.exit(2);
  }
  for (const d of ['rxnav', 'drugs']) mkdirSync(resolve(CACHE_DIR, d), { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const profiles = JSON.parse(readFileSync(PROFILES, 'utf8')) as CountryProfiles;
  let drugs = (JSON.parse(readFileSync(DRUGS, 'utf8')) as DrugRecord[]).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  if (slugs.length) drugs = drugs.filter((d) => slugs.includes(d.slug));
  if (limit !== undefined) drugs = drugs.slice(0, limit);

  const retrievedAt = new Date().toISOString();
  const outcomes = new Map<string, Outcome>();
  let quotaHit: string | null = null;
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (!quotaHit && next < drugs.length) {
      const drug = drugs[next++];
      try {
        outcomes.set(drug.slug, await processDrug(drug, profiles, retrievedAt));
      } catch (e) {
        quotaHit = (e as Error).message;
        outcomes.set(drug.slug, { status: 'pending', detail: 'openFDA quota reached' });
      }
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${drugs.length}`);
    }
  }
  console.log(`Ingesting manufacturer labels for ${drugs.length} drug(s)…`);
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  for (const d of drugs) {
    if (!outcomes.has(d.slug))
      outcomes.set(d.slug, { status: 'pending', detail: 'not reached (quota)' });
  }

  // Merge with previous output so partial runs (--slug/--limit/quota) don't
  // discard labels ingested earlier.
  const outFile = resolve(OUT_DIR, 'manufacturer-labels.json');
  const previous: ManufacturerLabel[] = existsSync(outFile)
    ? JSON.parse(readFileSync(outFile, 'utf8'))
    : [];
  const touched = new Set(
    [...outcomes].filter(([, o]) => o.status !== 'pending' && o.status !== 'error').map(([s]) => s),
  );
  const labels = [
    ...previous.filter((l) => !touched.has(l.slug)),
    ...[...outcomes.values()].flatMap((o) => (o.status === 'matched' ? o.labels : [])),
  ].sort((a, b) => a.slug.localeCompare(b.slug) || a.routes.join().localeCompare(b.routes.join()));
  writeFileSync(outFile, JSON.stringify(labels, null, 2) + '\n');

  writeFileSync(
    resolve(OUT_DIR, 'match-report.md'),
    renderReport(drugs, outcomes, labels, quotaHit),
  );
  const count = (s: Outcome['status']) =>
    [...outcomes.values()].filter((o) => o.status === s).length;
  console.log(
    `matched ${count('matched')} · no US label ${count('no-us-label')} · unresolved ${count('unresolved-ingredient')} · ` +
      `rxnorm mismatch ${count('rxnorm-mismatch')} · error ${count('error')} · pending ${count('pending')}`,
  );
  console.log(`${labels.length} label record(s) → content/labels/manufacturer-labels.json`);
  if (quotaHit)
    console.log(`Stopped early: ${quotaHit}\nRe-run later (or set OPENFDA_API_KEY) to resume.`);
}

function renderReport(
  drugs: DrugRecord[],
  outcomes: Map<string, Outcome>,
  labels: ManufacturerLabel[],
  quotaHit: string | null,
): string {
  const rows = (status: Outcome['status']) =>
    drugs
      .filter((d) => outcomes.get(d.slug)?.status === status)
      .map((d) => {
        const o = outcomes.get(d.slug)!;
        const detail = 'detail' in o ? o.detail : '';
        return `| ${d.slug} | ${d.inn} | ${d.kemlLevel ?? ''} | ${detail.replace(/\|/g, '/')} |`;
      });
  const section = (title: string, status: Outcome['status'], note: string) => {
    const r = rows(status);
    return r.length
      ? `\n## ${title} (${r.length})\n\n${note}\n\n| slug | INN | KEML level | detail |\n|---|---|---|---|\n${r.join('\n')}\n`
      : '';
  };
  const matched = drugs.filter((d) => outcomes.get(d.slug)?.status === 'matched');
  const byApp = labels.reduce<Record<string, number>>(
    (acc, l) => ((acc[l.applicationType] = (acc[l.applicationType] ?? 0) + 1), acc),
    {},
  );
  return `# Manufacturer label match report

Generated ${new Date().toISOString()} by \`npm run labels:ingest\`. Draft reference
content — see docs/manufacturer-label-licensing.md before promotion.

- Drugs in this run: ${drugs.length}
- Matched to ≥1 US label: ${matched.length}
- Label records in content/labels/manufacturer-labels.json (all runs): ${labels.length} — by application type: ${Object.entries(
    byApp,
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}
${quotaHit ? `\n> **Run stopped early:** ${quotaHit}. Pending drugs resume on the next run.\n` : ''}
${section('RxNorm code disagrees with INN', 'rxnorm-mismatch', 'The drug record’s `rxnorm` resolves to a different ingredient than its INN. No label attached — fix the record’s code first.')}${section('Ingredient not resolved', 'unresolved-ingredient', 'RxNav could not resolve the INN. Add an alias to scripts/lib/inn-usan-aliases.json if a US name exists.')}${section('No US label', 'no-us-label', 'Resolved in RxNorm, but no current single-product US label (common for WHO-EML-only medicines and some vaccines). Candidates for a PPB/SAHPRA source once permission is granted.')}${section('Errors', 'error', 'Transient failures — not cached, retried next run.')}${section('Pending', 'pending', 'Not processed in this run because the openFDA quota was reached.')}
## Matched (${matched.length})

| slug | INN | routes | reference label |
|---|---|---|---|
${matched
  .map((d) => {
    const ls = labels.filter((l) => l.slug === d.slug);
    return `| ${d.slug} | ${d.inn} | ${ls.map((l) => l.routes.join('+')).join('; ')} | ${ls.map((l) => `${l.brandNames[0] ?? ''} (${l.applicationType}, ${l.manufacturer}, ${l.effectiveDate})`.replace(/\|/g, '/')).join('; ')} |`;
  })
  .join('\n')}
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
