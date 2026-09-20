#!/usr/bin/env ts-node
/**
 * Apply approved correction proposals to the NEXT bundle version.
 *
 *   npm run corrections:apply -- --bundle content/bundles/v0.2.0 \
 *       --from-decisions approvals.json [--dry-run]
 *
 * Input is GET /v1/governance/reviews/export; only its `corrections` are used.
 * Run this BEFORE `bundle:promote --from-decisions`: a corrected record's
 * content changes, so it returns to draft and needs its own review.
 *
 * Every rule is re-checked here rather than trusted from the export:
 *   - the proposal is exactly what reviewers approved (its hash matches);
 *   - at least two distinct named reviewers with roles (FR-024);
 *   - only correctable fields change (src/modules/governance/corrections.ts);
 *   - the target record in THIS bundle is the content the proposal was made
 *     against, and each field still holds the value being replaced.
 * All-or-nothing: if any correction is refused, no file is written.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CORRECTABLE_FIELDS,
  applyCorrection,
  correctionConflicts,
  type CorrectionProposal,
} from '../src/modules/governance/corrections';
import { recordContentHash, recordKey } from '../src/modules/governance/record-hash';

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const bundleArg = flag('bundle');
const decisionsArg = flag('from-decisions');
if (!bundleArg || !decisionsArg) {
  console.error(
    'Usage: corrections:apply -- --bundle <next-version-dir> --from-decisions <export.json> [--dry-run]',
  );
  process.exit(1);
}
const BUNDLE = resolve(process.cwd(), bundleArg);
if (/v0\.1\.0\/?$/.test(BUNDLE)) {
  console.error(
    'Refusing to edit the shipped signed bundle v0.1.0 — copy it to the next version first.',
  );
  process.exit(1);
}

interface Entry {
  proposal?: CorrectionProposal;
  proposalHash?: string;
  reviewers?: Array<{ name?: string; role?: string }>;
}

let entries: Entry[];
try {
  const parsed = JSON.parse(readFileSync(resolve(process.cwd(), decisionsArg), 'utf8'));
  entries = Array.isArray(parsed?.corrections) ? parsed.corrections : [];
} catch (e) {
  console.error(`Cannot read ${decisionsArg}: ${(e as Error).message}`);
  process.exit(1);
}
if (!entries.length) {
  console.log('No approved corrections in the decisions file — nothing to do.');
  process.exit(0);
}

const files = new Map<string, Array<Record<string, unknown>>>();
const domainFiles = new Set(readdirSync(BUNDLE).filter((f) => f.endsWith('.json')));
const refusals: string[] = [];
const planned: Array<{ file: string; idx: number; next: Record<string, unknown>; label: string }> =
  [];
const touched = new Set<string>();

for (const e of entries) {
  const p = e.proposal;
  const label = p?.id ?? '(unnamed proposal)';
  if (!p || recordContentHash(p) !== e.proposalHash) {
    refusals.push(`${label}: proposal differs from what reviewers approved (hash mismatch)`);
    continue;
  }
  const named = (e.reviewers ?? []).filter((r) => r?.name?.trim() && r?.role?.trim());
  if (new Set(named.map((r) => r.name!.trim().toLowerCase())).size < 2) {
    refusals.push(`${label}: needs at least two distinct named reviewers with roles (FR-024)`);
    continue;
  }
  if (
    p.kind !== 'set-field' ||
    !p.changes?.every((c) => (CORRECTABLE_FIELDS as readonly string[]).includes(c.field))
  ) {
    refusals.push(`${label}: changes a field that is not machine-correctable`);
    continue;
  }
  const file = `${p.domain}.json`;
  if (!domainFiles.has(file)) {
    refusals.push(`${label}: no domain file ${file} in ${BUNDLE}`);
    continue;
  }
  if (!files.has(file)) files.set(file, JSON.parse(readFileSync(join(BUNDLE, file), 'utf8')));
  const records = files.get(file)!;
  const idx = records.findIndex((r) => recordKey(r) === p.recordId);
  const conflicts = correctionConflicts(p, idx >= 0 ? records[idx] : undefined);
  if (conflicts.length) {
    refusals.push(`${label}: ${conflicts.join('; ')}`);
    continue;
  }
  const key = `${file}#${idx}`;
  if (touched.has(key)) {
    refusals.push(
      `${label}: another correction in this batch already changes ${p.domain}/${p.recordId}`,
    );
    continue;
  }
  touched.add(key);
  planned.push({ file, idx, next: applyCorrection(p, records[idx]), label });
}

if (refusals.length) {
  console.error(`Refusing the whole batch — ${refusals.length} correction(s) failed checks:`);
  for (const r of refusals) console.error(`  - ${r}`);
  process.exit(2);
}
if (args.includes('--dry-run')) {
  for (const p of planned) console.log(`[dry-run] ${p.label}`);
  console.log(`\n[dry-run] ${planned.length} correction(s) would be applied to ${BUNDLE}.`);
  process.exit(0);
}
for (const p of planned) files.get(p.file)![p.idx] = p.next;
for (const file of new Set(planned.map((p) => p.file))) {
  writeFileSync(join(BUNDLE, file), `${JSON.stringify(files.get(file), null, 2)}\n`);
}
console.log(
  `Applied ${planned.length} correction(s) to ${BUNDLE}; corrected records are back in draft.`,
);
console.log(
  '\nNext: re-run npm run audit:drug-rxnorm against this bundle, review the corrected records, ' +
    'then bundle:promote and bundle:sign.',
);
