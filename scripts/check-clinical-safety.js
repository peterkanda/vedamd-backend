#!/usr/bin/env node
/**
 * Clinical-safety content linter — a defensive scan for the dosing/medical-error
 * patterns that are most dangerous in a CDS, run over the signed bundle AND the
 * country overlays.
 *
 *   npm run check:clinical-safety            # report
 *   npm run check:clinical-safety -- --strict  # fail on overlay dose-leakage
 *
 * It does NOT replace clinical review — it catches mechanical red flags:
 *   A. OVERLAY DOSE LEAKAGE — national overlays must state the first-line CHOICE
 *      but defer specific mg/kg doses to the weight-based charts + the runtime
 *      guardrail. Any concrete dose appearing in an overlay management/step is a
 *      regression of that rule. (strict-fail eligible.)
 *   B. PER-KG DOSE WITHOUT A MAX — a weight-based dose with no "max"/"not exceed"
 *      ceiling is a classic paediatric overdose risk.
 *   C. DOSE WITHOUT A CITATION — a record that states a dose but carries no
 *      reference is unverifiable provenance.
 *
 * Reports counts + samples so the numbers can be driven down over time.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const BUNDLE = path.resolve(ROOT, 'content/bundles/v0.1.0');
const OVERLAYS = path.resolve(ROOT, 'content/overlays');
const strict = process.argv.includes('--strict');

// A concrete drug dose: number + dose unit. Per-kg variants match first; bare
// units match only when NOT followed by /dL or /L (those are lab CONCENTRATIONS,
// e.g. "126 mg/dL" glucose, not doses).
const DOSE =
  /\b\d+(?:\.\d+)?\s?(?:(?:mg|mcg|micrograms?|units?|iu|ml)\s?\/\s?kg|(?:mg|mcg|micrograms?|grams?|iu|units?|ml)(?!\s?\/\s?d?l\b))/i;
const PER_KG = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|micrograms?|units?|iu|ml)\s?\/\s?kg\b/i;
// Titrated infusion RATE (per-kg per unit time / per dose) — a different safety
// profile from a flat per-kg dose; reported separately, not in the dose ceiling.
const PER_KG_RATE = /\/\s?kg\s?\/\s?(?:min|sec|hour|hr|h|day|24\s?h|dose)/i;
const HAS_MAX = /\b(max|maximum|not exceed|up to|ceiling|cap\b)/i;

// Ratchet ceiling for category B (per-kg DOSE without a stated max). Reflects
// the current bundle; CI (--strict) fails if it GROWS, so new content can't add
// uncapped per-kg doses. Lower it as the review worklist is worked down.
const MAX_PERKG_DOSE_NO_MAX = 363;

function jsonFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonFiles(p));
    else if (entry.name.endsWith('.json') && entry.name !== 'manifest.json' && entry.name !== 'overlay.json' && entry.name !== 'provenance.json')
      out.push(p);
  }
  return out;
}

/** Collect record objects (anything with a `slug` or `references`) + all string text. */
function records(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(parsed) ? parsed : parsed.records ?? Object.values(parsed).find(Array.isArray) ?? [parsed];
  return Array.isArray(arr) ? arr.filter((r) => r && typeof r === 'object') : [];
}

function allText(node, acc = []) {
  if (typeof node === 'string') acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => allText(n, acc));
  else if (node && typeof node === 'object') for (const v of Object.values(node)) allText(v, acc);
  return acc;
}

const leakage = []; // A
const perKgNoMax = []; // B
const doseNoCite = []; // C

// A — overlays must not carry concrete doses.
for (const file of jsonFiles(OVERLAYS)) {
  for (const rec of records(file)) {
    const text = allText(rec).join(' • ');
    if (DOSE.test(text)) {
      leakage.push({ file: path.relative(ROOT, file), slug: rec.slug, sample: (text.match(DOSE) || [''])[0] });
    }
  }
}

const perKgRates = []; // titrated rates (informational, not in the ceiling)

// B + C — bundle dose-safety.
for (const file of jsonFiles(BUNDLE)) {
  for (const rec of records(file)) {
    const text = allText(rec).join(' • ');
    if (PER_KG.test(text) && !HAS_MAX.test(text)) {
      const item = { file: path.basename(file), slug: rec.slug || rec.id, sample: (text.match(PER_KG) || [''])[0] };
      if (PER_KG_RATE.test(text)) perKgRates.push(item);
      else perKgNoMax.push(item);
    }
    const hasRefs = Array.isArray(rec.references) && rec.references.length > 0;
    if (DOSE.test(text) && !hasRefs) {
      doseNoCite.push({ file: path.basename(file), slug: rec.slug || rec.id });
    }
  }
}

const show = (label, list, n = 8) => {
  console.log(`\n${label}: ${list.length}`);
  for (const v of list.slice(0, n)) console.log(`  - ${v.file} :: ${v.slug ?? '?'}${v.sample ? `  ["${v.sample}"]` : ''}`);
  if (list.length > n) console.log(`  … and ${list.length - n} more`);
};

console.log('Clinical-safety content scan');
show('A. Overlay dose leakage (should be 0 — overlays defer doses to charts)', leakage);
show(`B. Per-kg DOSE without a max/ceiling (overdose risk; ratchet ≤ ${MAX_PERKG_DOSE_NO_MAX})`, perKgNoMax);
show('B-rate. Per-kg titrated infusion rate without a max (informational)', perKgRates, 4);
show('C. Concrete dose on a record with NO citation', doseNoCite);

// Emit a review worklist (for the deferred MedGemma/clinician pass).
if (process.argv.includes('--worklist')) {
  const dir = path.resolve(ROOT, 'content/safety');
  fs.mkdirSync(dir, { recursive: true });
  const md = [
    '# Per-kg dose review worklist',
    '',
    `Records stating a per-kg dose with no explicit max/ceiling in the record text.`,
    `Each needs a clinician/MedGemma check to add the correct maximum (or confirm none applies).`,
    `Generated by \`npm run check:clinical-safety -- --worklist\`. Total: ${perKgNoMax.length}.`,
    '',
    '| File | Record | Per-kg dose |',
    '|---|---|---|',
    ...perKgNoMax.map((v) => `| ${v.file} | \`${v.slug ?? '?'}\` | ${v.sample} |`),
  ].join('\n');
  fs.writeFileSync(path.resolve(dir, 'perkg-dose-review.md'), `${md}\n`);
  console.log(`\nWrote content/safety/perkg-dose-review.md (${perKgNoMax.length} items).`);
}

const failures = [];
if (leakage.length > 0) failures.push(`${leakage.length} overlay dose-leakage`);
if (perKgNoMax.length > MAX_PERKG_DOSE_NO_MAX)
  failures.push(`per-kg dose-without-max grew to ${perKgNoMax.length} (ceiling ${MAX_PERKG_DOSE_NO_MAX})`);

if (strict && failures.length > 0) {
  console.error(`\nFAILED (--strict): ${failures.join('; ')}.`);
  process.exit(1);
}
console.log('\n(report mode — pass --strict to enforce: overlay-leakage=0 and the per-kg-dose ratchet)');
