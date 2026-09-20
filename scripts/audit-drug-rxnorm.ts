#!/usr/bin/env ts-node
/**
 * Audit drugs.json RxNorm codes against each drug's INN (via RxNav).
 *
 *   npm run audit:drug-rxnorm            # writes content/safety/rxnorm-code-audit.md
 *   npm run audit:drug-rxnorm -- --bundle content/bundles/v0.2.0
 *
 * Why: DrugCodeIndex (src/modules/cds/normalize/code-resolver.ts) maps an
 * incoming EHR RxNorm coding straight to a drug slug using `drug.rxnorm`. A
 * code that belongs to another molecule makes CDS reason about the wrong drug,
 * and a code shared by several records resolves to whichever is indexed last.
 * Found while matching manufacturer labels, where the same check blocks label
 * attachment.
 *
 * Read-only: proposes corrections, never edits the signed bundle.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';
import { parseInnComponents } from './lib/manufacturer-labels';
import { ingredientForName, relatedIngredients, rxnav } from './lib/rxnav-client';

const ROOT = resolve(__dirname, '..');
const bundleArg = process.argv.indexOf('--bundle');
/** Bundle to audit — the shipped one by default; pass the next version after applying corrections. */
const BUNDLE = resolve(
  process.cwd(),
  bundleArg >= 0 ? process.argv[bundleArg + 1] : resolve(ROOT, 'content/bundles/v0.1.0'),
);
const BUNDLE_NAME = BUNDLE.split('/').pop() ?? 'unknown';
const OUT = resolve(ROOT, 'content/safety/rxnorm-code-audit.md');
/**
 * Machine-readable deny-list read by DrugCodeIndex: every code the audit
 * found to be wrong. It can only REMOVE code→drug mappings at runtime, never
 * add one, so it is safe to ship outside the signed bundle.
 */
const QUARANTINE = resolve(ROOT, 'content/safety/rxnorm-quarantine.json');
const QUARANTINED: Verdict[] = [
  'wrong-ingredient',
  'name-mismatch',
  'partial-combination',
  'different-concept',
  'code-not-found',
];

type Verdict =
  | 'ok'
  | 'wrong-ingredient'
  | 'partial-combination'
  | 'different-concept'
  | 'code-not-found'
  | 'name-mismatch'
  | 'inn-unresolved';

interface Row {
  drug: DrugRecord;
  verdict: Verdict;
  codeName: string;
  codeTty: string;
  codeIngredients: string;
  innIngredients: string;
  suggested: string;
}

async function suggestCode(ings: { rxcui: string; name: string }[]): Promise<string> {
  if (ings.length === 1) return `${ings[0].rxcui} (${ings[0].name}, IN)`;
  // RxNorm multi-ingredient (MIN) names list components alphabetically, " / "-joined.
  const name = ings
    .map((i) => i.name)
    .sort((a, b) => a.localeCompare(b))
    .join(' / ');
  const ids = await rxnav(`rxcui.json?name=${encodeURIComponent(name)}&search=2`);
  const id: string | undefined = ids?.idGroup?.rxnormId?.[0];
  return id ? `${id} (${name}, MIN)` : `— (no MIN for ${name})`;
}

async function audit(drug: DrugRecord): Promise<Row> {
  const code = drug.rxnorm!.trim();
  const props = (await rxnav(`rxcui/${encodeURIComponent(code)}/properties.json`))?.properties;
  const components = parseInnComponents(drug.inn);
  const byName = await Promise.all(components.map((c) => ingredientForName(c)));
  const innIngs = byName.every(Boolean)
    ? [...new Map(byName.map((i) => [i!.rxcui, i!])).values()]
    : [];
  const base = {
    drug,
    codeName: props?.name ?? '—',
    codeTty: props?.tty ?? '—',
    innIngredients: innIngs.map((i) => `${i.name} (${i.rxcui})`).join(' + ') || '—',
  };
  if (!props) {
    return {
      ...base,
      verdict: 'code-not-found',
      codeIngredients: '—',
      suggested: innIngs.length ? await suggestCode(innIngs) : '—',
    };
  }
  const codeIngs =
    props.tty === 'IN'
      ? [{ rxcui: code, name: props.name as string }]
      : await relatedIngredients(code);
  const codeIngredients = codeIngs.map((i) => `${i.name} (${i.rxcui})`).join(' + ') || '—';
  if (!innIngs.length) {
    // The INN can't be resolved (vaccines, mixtures), so the code can't be
    // verified positively — but it can be falsified: if none of the code's
    // ingredient names appears in the INN text at all, it names some other
    // product (e.g. a rabies vaccine coded as prenylamine).
    const inn = drug.inn.toLowerCase();
    const words = codeIngs
      .flatMap((i) => i.name.toLowerCase().split(/[^a-z]+/))
      .filter((w) => w.length >= 4);
    const mentioned = words.some((w) => inn.includes(w));
    return {
      ...base,
      verdict: codeIngs.length && !mentioned ? 'name-mismatch' : 'inn-unresolved',
      codeIngredients,
      suggested: '—',
    };
  }

  const a = new Set(codeIngs.map((i) => i.rxcui));
  const b = new Set(innIngs.map((i) => i.rxcui));
  const overlap = [...a].filter((x) => b.has(x)).length;
  let verdict: Verdict;
  if (overlap === a.size && a.size === b.size) verdict = 'ok';
  else if (overlap === 0) verdict = 'wrong-ingredient';
  else if (overlap === a.size && a.size < b.size) verdict = 'partial-combination';
  else verdict = 'different-concept';
  return {
    ...base,
    verdict,
    codeIngredients,
    suggested: verdict === 'ok' ? '' : await suggestCode(innIngs),
  };
}

async function main(): Promise<void> {
  const drugs = JSON.parse(readFileSync(resolve(BUNDLE, 'drugs.json'), 'utf8')) as DrugRecord[];
  const coded = drugs.filter((d) => d.rxnorm?.trim());
  console.log(`Auditing ${coded.length} RxNorm-coded drug record(s)…`);

  const rows: Row[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < coded.length) {
        const d = coded[next++];
        try {
          rows.push(await audit(d));
        } catch (e) {
          console.error(`  ${d.slug}: ${(e as Error).message}`);
        }
      }
    }),
  );
  rows.sort((x, y) => x.drug.slug.localeCompare(y.drug.slug));

  // Collisions, replaying DrugCodeIndex's last-writer-wins over bundle order.
  const bySlugOrder = new Map(drugs.map((d, i) => [d.slug, i]));
  const shared = new Map<string, DrugRecord[]>();
  for (const d of coded) shared.set(d.rxnorm!.trim(), [...(shared.get(d.rxnorm!.trim()) ?? []), d]);
  const collisions = [...shared.entries()]
    .filter(([, ds]) => ds.length > 1)
    .map(([code, ds]) => {
      const ordered = [...ds].sort((x, y) => bySlugOrder.get(x.slug)! - bySlugOrder.get(y.slug)!);
      return {
        code,
        slugs: ordered.map((d) => d.slug),
        resolvesTo: ordered[ordered.length - 1].slug,
      };
    })
    .sort((x, y) => x.code.localeCompare(y.code));

  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const table = (verdicts: Verdict[]) =>
    rows
      .filter((r) => verdicts.includes(r.verdict))
      .map(
        (r) =>
          `| ${r.drug.slug} | ${r.drug.inn} | ${r.drug.kemlLevel ?? ''} | ${r.drug.rxnorm} → ${r.codeName} (${r.codeTty}) | ${r.innIngredients} | ${r.suggested} |`,
      )
      .join('\n');
  const head =
    '| slug | INN | KEML | current code → RxNorm concept | INN resolves to | suggested code |\n|---|---|---|---|---|---|';

  const md = `# RxNorm code audit — drugs.json (${BUNDLE_NAME})

Generated ${new Date().toISOString()} by \`npm run audit:drug-rxnorm\` against
RxNav (US NLM). Read-only worklist: **no bundle content was changed.**

\`DrugCodeIndex\` (src/modules/cds/normalize/code-resolver.ts) maps an EHR's
RxNorm coding directly to a VedaMD drug using these codes, so a wrong code
makes CDS evaluate the wrong medicine. Corrections need clinical-content
review and a re-signed bundle.

| verdict | count | meaning |
|---|---|---|
| ok | ${count('ok')} | code's ingredient(s) = INN's ingredient(s) |
| wrong-ingredient | ${count('wrong-ingredient')} | code belongs to a different molecule — **fix first** |
| partial-combination | ${count('partial-combination')} | combination drug coded as one of its components |
| different-concept | ${count('different-concept')} | overlapping but unequal ingredient sets |
| code-not-found | ${count('code-not-found')} | RxNav has no concept for the code |
| name-mismatch | ${count('name-mismatch')} | INN not resolvable, and none of the code's ingredients is named in it — another product |
| inn-unresolved | ${count('inn-unresolved')} | INN not resolvable in RxNorm (vaccines, classes) — code not verifiable here |

Suggested codes are ingredient-level (IN) or multi-ingredient (MIN) concepts
derived from the INN. Confirm each against the record's intended product
before applying.

## Wrong ingredient (${count('wrong-ingredient')})

${head}
${table(['wrong-ingredient'])}

## Partial combination / different concept (${count('partial-combination') + count('different-concept')})

${head}
${table(['partial-combination', 'different-concept'])}

## Name mismatch (${count('name-mismatch')})

${head}
${table(['name-mismatch'])}

## Code not found (${count('code-not-found')})

${head}
${table(['code-not-found'])}

## Codes shared by several records (${collisions.length})

\`DrugCodeIndex\` keeps the last record indexed, so every other record sharing
the code is unreachable by RxNorm and the code resolves to the slug shown.

| code | records (bundle order) | currently resolves to |
|---|---|---|
${collisions.map((c) => `| ${c.code} | ${c.slugs.join(', ')} | ${c.resolvesTo} |`).join('\n')}
`;
  mkdirSync(resolve(ROOT, 'content/safety'), { recursive: true });
  writeFileSync(OUT, md);
  const quarantine = {
    description:
      "RxNorm codes on drugs.json records that do not identify the record's own ingredient(s). DrugCodeIndex ignores these codes and falls back to name matching. Generated by npm run audit:drug-rxnorm — do not edit by hand.",
    generatedAt: new Date().toISOString(),
    bundle: BUNDLE_NAME,
    codes: rows
      .filter((r) => QUARANTINED.includes(r.verdict))
      .map((r) => ({
        code: r.drug.rxnorm!.trim(),
        slug: r.drug.slug,
        verdict: r.verdict,
        currentConcept: r.codeName,
        suggested: r.suggested,
      })),
  };
  writeFileSync(QUARANTINE, JSON.stringify(quarantine, null, 2) + '\n');
  console.log(
    `ok ${count('ok')} · wrong ${count('wrong-ingredient')} · partial ${count('partial-combination')} · different ${count('different-concept')} · not-found ${count('code-not-found')} · name-mismatch ${count('name-mismatch')} · inn-unresolved ${count('inn-unresolved')} · shared codes ${collisions.length}`,
  );
  console.log(`→ ${OUT.replace(ROOT + '/', '')}`);
  console.log(
    `→ ${QUARANTINE.replace(ROOT + '/', '')} (${quarantine.codes.length} quarantined codes)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
