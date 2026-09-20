#!/usr/bin/env ts-node
/**
 * Generate correction proposals + human worklists from the content audits.
 *
 *   npm run corrections:propose     # after npm run audit:drug-rxnorm
 *   npm run corrections:propose -- --bundle content/bundles/v0.2.0
 *
 * Writes:
 *   content/corrections/proposals.json  RxNorm fixes the audit verified against
 *                                       RxNav — reviewed in the queue under
 *                                       domain "corrections", applied to the next
 *                                       bundle by scripts/apply-corrections.ts
 *   content/corrections/worklist.md     issues that need clinical/editorial
 *                                       judgement and have no free authoritative
 *                                       source to propose a fix from: SNOMED and
 *                                       ATC codes shared across molecules, and
 *                                       candidate duplicate monographs
 *
 * Read-only with respect to the bundle.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';
import type { CorrectionProposal, CorrectionsFile } from '../src/modules/governance/corrections';
import { recordContentHash } from '../src/modules/governance/record-hash';
import { parseInnComponents } from './lib/manufacturer-labels';
import { drugRouteClasses } from './lib/routes';
import { ingredientForName } from './lib/rxnav-client';

const ROOT = resolve(__dirname, '..');
const bundleArg = process.argv.indexOf('--bundle');
/** Bundle to audit — the shipped one by default; pass the next version after applying corrections. */
const BUNDLE = resolve(
  process.cwd(),
  bundleArg >= 0 ? process.argv[bundleArg + 1] : resolve(ROOT, 'content/bundles/v0.1.0'),
);
const BUNDLE_NAME = BUNDLE.split('/').pop() ?? 'unknown';
const OUT_DIR = resolve(ROOT, 'content/corrections');
const rxnavUrl = (code: string) =>
  `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${encodeURIComponent(code)}`;

interface QuarantineEntry {
  code: string;
  slug: string;
  verdict: string;
  currentConcept: string;
  suggested: string;
}

/** "82819 (acamprosate, IN)" → { code, name, tty }; "— (no MIN …)" → null. */
function parseSuggestion(s: string): { code: string; name: string; tty: string } | null {
  const m = /^(\d+) \((.+), (IN|MIN)\)$/.exec(s.trim());
  return m ? { code: m[1], name: m[2], tty: m[3] } : null;
}

function moleculeKey(inn: string): string {
  let s = inn.toLowerCase();
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  }
  return s
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const drugs = JSON.parse(readFileSync(resolve(BUNDLE, 'drugs.json'), 'utf8')) as DrugRecord[];
  const bySlug = new Map(drugs.map((d) => [d.slug, d]));
  const quarantine = JSON.parse(
    readFileSync(resolve(ROOT, 'content/safety/rxnorm-quarantine.json'), 'utf8'),
  ) as { generatedAt: string; codes: QuarantineEntry[] };

  // ── Proposals: RxNorm codes ────────────────────────────────────────
  const proposals: CorrectionProposal[] = [];
  const noSuggestion: QuarantineEntry[] = [];
  for (const q of quarantine.codes) {
    const drug = bySlug.get(q.slug);
    const s = parseSuggestion(q.suggested);
    if (!drug || drug.rxnorm?.trim() !== q.code || !s) {
      noSuggestion.push(q);
      continue;
    }
    const current =
      q.verdict === 'code-not-found' ? `does not exist in RxNorm` : `is "${q.currentConcept}"`;
    proposals.push({
      id: `rxnorm:${drug.slug}`,
      kind: 'set-field',
      domain: 'drugs',
      recordId: drug.slug,
      baseHash: recordContentHash(drug),
      changes: [{ field: 'rxnorm', from: drug.rxnorm, to: s.code }],
      rationale:
        `RxNorm ${q.code} ${current} (${q.verdict}). The record's INN "${drug.inn}" resolves ` +
        `to ${s.code} (${s.name}, ${s.tty}).`,
      evidence: [
        { label: `RxNav: current code ${q.code}`, url: rxnavUrl(q.code) },
        { label: `RxNav: proposed code ${s.code}`, url: rxnavUrl(s.code) },
        { label: 'content/safety/rxnorm-code-audit.md' },
      ],
      generatedBy: 'npm run corrections:propose (from npm run audit:drug-rxnorm)',
    });
  }
  proposals.sort((a, b) => a.id.localeCompare(b.id));

  // Codes the corrections would make shared by records for differently named
  // molecules (true duplicates like cefalexin / cephalexin converge on one
  // code). The resolver refuses shared codes, so this is safe, but editors
  // should resolve the duplicate alongside the correction.
  const after = new Map(drugs.map((d) => [d.slug, d.rxnorm?.trim()]));
  // Quarantined claims without a proposal are ignored at runtime — not shared.
  for (const q of noSuggestion) after.delete(q.slug);
  for (const p of proposals) after.set(p.recordId, String(p.changes[0].to));
  const byCode = new Map<string, DrugRecord[]>();
  for (const d of drugs) {
    const code = after.get(d.slug);
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), d]);
  }
  const convergent = [...byCode.entries()]
    .filter(([, ds]) => new Set(ds.map((d) => moleculeKey(d.inn))).size > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // ── Worklist: shared ATC / SNOMED codes across molecules ───────────
  const shared = (get: (d: DrugRecord) => string[]) => {
    const m = new Map<string, DrugRecord[]>();
    for (const d of drugs) for (const c of get(d)) m.set(c, [...(m.get(c) ?? []), d]);
    return [...m.entries()]
      .filter(([, ds]) => new Set(ds.map((d) => moleculeKey(d.inn))).size > 1)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  };
  const atcShared = shared((d) => (d.atc ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean));
  const snomedShared = shared((d) => {
    const v = d.snomed as unknown;
    return (Array.isArray(v) ? v : v ? [v] : []).map((c) => String(c).trim()).filter(Boolean);
  });

  // ── Worklist: candidate duplicate monographs ───────────────────────
  // Same RxNorm ingredient set and same routes. Most groups are deliberate
  // (X / X-detail monographs, distinct salts or strengths), so these are
  // candidates for an editor, never automatic retirements.
  const groups = new Map<string, DrugRecord[]>();
  for (const d of drugs) {
    const ings = await Promise.all(parseInnComponents(d.inn).map((c) => ingredientForName(c)));
    if (!ings.length || !ings.every(Boolean)) continue;
    const key =
      [...new Set(ings.map((i) => i!.rxcui))].sort().join('+') +
      '|' +
      [...drugRouteClasses(d)].sort().join(',');
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  const isDetailPair = (g: DrugRecord[]) =>
    g.length === 2 && g.some((a) => g.some((b) => a !== b && b.slug === `${a.slug}-detail`));
  const detailPairs = dupGroups.filter(isDetailPair);
  const otherGroups = dupGroups.filter((g) => !isDetailPair(g));

  const cell = (s: string) => s.replace(/\|/g, '/');
  const list = (ds: DrugRecord[]) => ds.map((d) => `${d.slug} (${cell(d.inn)})`).join('; ');
  const md = `# Content corrections worklist

Generated ${new Date().toISOString()} by \`npm run corrections:propose\`.
Machine-verifiable fixes are in \`proposals.json\` (${proposals.length} RxNorm
corrections, reviewed in the queue under domain \`corrections\`). Everything
below needs clinical or editorial judgement — there is no free authoritative
source to propose these fixes from automatically.

## Quarantined RxNorm codes without a proposal (${noSuggestion.length})

No single ingredient or multi-ingredient RxNorm concept was found for the INN;
choose the right code (or remove it) by hand.

| slug | current code | verdict | concept |
|---|---|---|---|
${noSuggestion.map((q) => `| ${q.slug} | ${q.code} | ${q.verdict} | ${cell(q.currentConcept)} |`).join('\n')}

## RxNorm codes the corrections will make shared (${convergent.length})

After the proposals are applied these codes are claimed by records with
different INN text — usually a duplicate monograph. The resolver refuses shared
codes (no match rather than a wrong match); merge or retire the duplicate.

| RxNorm | records |
|---|---|
${convergent.map(([c, ds]) => `| ${c} | ${list(ds)} |`).join('\n')}

## ATC codes shared by different molecules (${atcShared.length})

The resolver refuses these codes, so ATC-only EHR messages for them get no
match. Fix the wrong assignment(s); variants of one molecule written with
different INN text (e.g. "cefalexin" / "cephalexin") only need consistent INNs.

| ATC | records |
|---|---|
${atcShared.map(([c, ds]) => `| ${c} | ${list(ds)} |`).join('\n')}

## SNOMED CT codes shared by different molecules (${snomedShared.length})

SNOMED is not served (CONTENT_SNOMED_ENABLED off), but these codes must be
audited before it is enabled — several are shared by many unrelated drugs.

| SNOMED | records |
|---|---|
${snomedShared.map(([c, ds]) => `| ${c} | ${ds.length}: ${list(ds)} |`).join('\n')}

## Candidate duplicate monographs (${otherGroups.length})

Same RxNorm ingredient(s) and routes. Many are deliberately separate (salts,
strengths, formulations) — decide per group: keep both, merge, or retire one
(retiring requires no other record to reference the slug).

| records |
|---|
${otherGroups.map((g) => `| ${list(g)} |`).join('\n')}

## X / X-detail monograph pairs (${detailPairs.length})

Pairs where a \`-detail\` record duplicates a base monograph. Confirm this split
is intended; if not, merge into one record.

${detailPairs.map((g) => `- ${g.map((d) => d.slug).join(' / ')}`).join('\n')}
`;

  const file: CorrectionsFile = {
    description:
      'Correction proposals for bundle content, generated from verified audits. Reviewed in the governance review queue (domain "corrections"); approved proposals are applied to the NEXT bundle version by scripts/apply-corrections.ts. Do not edit by hand — regenerate.',
    bundle: BUNDLE_NAME,
    generatedAt: new Date().toISOString(),
    proposals,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'proposals.json'), JSON.stringify(file, null, 2) + '\n');
  writeFileSync(resolve(OUT_DIR, 'worklist.md'), md);
  console.log(
    `${proposals.length} RxNorm proposal(s); worklist: ${noSuggestion.length} without proposal, ` +
      `${convergent.length} codes made shared, ${atcShared.length} shared ATC, ${snomedShared.length} shared SNOMED, ` +
      `${otherGroups.length} duplicate candidates, ${detailPairs.length} -detail pairs`,
  );
  console.log('→ content/corrections/proposals.json, content/corrections/worklist.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
