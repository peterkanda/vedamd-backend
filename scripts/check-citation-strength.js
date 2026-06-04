#!/usr/bin/env node
/**
 * Citation-strength CI gate.
 *
 * Every reference in the signed bundle MUST carry a `strength` field
 * ('A', 'B', 'C', or 'D') so the UI can render a source-quality badge.
 * This script fails the build if any reference is missing or malformed.
 *
 * To auto-fill missing strengths, run:
 *   node scripts/score-citation-sources.js
 *
 * Policy:
 *   - Strength is REQUIRED on every reference.
 *   - Any of the 4 tiers (including D — Wikipedia / WebMD / consumer)
 *     is acceptable; the UI shows the tier and lets clinicians
 *     calibrate trust.
 *   - There is NO blocklist of source domains — we trust transparency
 *     over editorial gatekeeping. Reviewers can flag content during
 *     the clinical-review process if D-tier sources are the SOLE
 *     reference for a clinical recommendation.
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../content/bundles/v0.1.0');
const VALID = new Set(['A', 'B', 'C', 'D']);

const violations = [];

function visit(node, file, slug, trail) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) visit(node[i], file, slug, [...trail, i]);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const localSlug = node.slug || node.id || slug;
  if (Array.isArray(node.references)) {
    for (let i = 0; i < node.references.length; i += 1) {
      const ref = node.references[i];
      if (!ref || typeof ref !== 'object') continue;
      if (!VALID.has(ref.strength)) {
        violations.push({
          file,
          slug: localSlug,
          path: [...trail, 'references', i].join('.'),
          label: (ref.label || '').slice(0, 120),
          actual: ref.strength ?? '(missing)',
        });
      }
    }
  }
  for (const k of Object.keys(node)) {
    if (k !== 'references') visit(node[k], file, localSlug, [...trail, k]);
  }
}

let totalRefs = 0;
const perTier = { A: 0, B: 0, C: 0, D: 0 };

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  visit(data, f, null, []);
  // Count for the summary
  const stack = [data];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v && typeof v === 'object') {
      if (Array.isArray(v.references)) {
        for (const r of v.references) {
          if (!r || typeof r !== 'object') continue;
          totalRefs += 1;
          if (VALID.has(r.strength)) perTier[r.strength] += 1;
        }
      }
      for (const k of Object.keys(v)) if (k !== 'references') stack.push(v[k]);
    }
  }
}

if (violations.length > 0) {
  console.error(
    `Citation-strength gate FAILED — ${violations.length} reference(s) missing strength:`,
  );
  for (const v of violations.slice(0, 40)) {
    console.error(
      `  ${v.file} :: ${v.slug} :: ${v.path}  → "${v.label}…"  (actual=${v.actual})`,
    );
  }
  if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
  console.error('\nRun:  node scripts/score-citation-sources.js');
  process.exit(1);
}

console.log(`OK — every reference carries a strength tier (${totalRefs} refs total).`);
console.log(
  `Distribution: A=${perTier.A}  B=${perTier.B}  C=${perTier.C}  D=${perTier.D}`,
);
