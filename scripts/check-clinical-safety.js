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
const HAS_MAX = /\b(max|maximum|not exceed|up to|ceiling|cap\b)/i;

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

// B + C — bundle dose-safety.
for (const file of jsonFiles(BUNDLE)) {
  for (const rec of records(file)) {
    const text = allText(rec).join(' • ');
    if (PER_KG.test(text) && !HAS_MAX.test(text)) {
      perKgNoMax.push({ file: path.basename(file), slug: rec.slug || rec.id, sample: (text.match(PER_KG) || [''])[0] });
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
show('B. Per-kg dose without a max/ceiling (paediatric overdose risk)', perKgNoMax);
show('C. Concrete dose on a record with NO citation', doseNoCite);

if (strict && leakage.length > 0) {
  console.error(`\nFAILED (--strict): ${leakage.length} overlay record(s) contain concrete doses.`);
  process.exit(1);
}
console.log('\n(report mode — pass --strict to fail on overlay dose leakage)');
