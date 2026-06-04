#!/usr/bin/env node
/**
 * CI gate: refuse a bundle that contains citations from non-acceptable
 * sources for a clinical-decision-support platform.
 *
 * Blocked source patterns:
 *   - Wikipedia (any subdomain of wikipedia.org / wikimedia.org)
 *   - Consumer aggregators (drugs.com, webmd.com, healthline.com, patient.info)
 *   - User-edited wikis (wikidoc, physio-pedia, statpearls, ePharma)
 *   - Free medical-education sites that are not peer-reviewed
 *     (litfl.com, emcrit.org)
 *   - Aggregator dictionaries (ebmconsult.com)
 *   - Vendor whitepapers presented as primary sources (precisepk.com)
 *   - News-style magazines (contemporarypediatrics.com, medscape news,
 *     speech-therapy commercial sites)
 *
 * Exits with code 1 if any match is found, listing every record + the
 * citation that triggered the block. Run by CI on every PR.
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../content/bundles/v0.1.0');

const BLOCKED_PATTERNS = [
  { name: 'Wikipedia / Wikimedia', re: /\b(?:wikipedia|wikimedia)\.org\b/i },
  { name: 'Drugs.com', re: /\bdrugs\.com\b/i },
  { name: 'WebMD', re: /\bwebmd\.com\b/i },
  { name: 'Healthline', re: /\bhealthline\.com\b/i },
  { name: 'Patient.info', re: /\bpatient\.info\b/i },
  { name: 'Physio-pedia (wiki)', re: /\bphysio-pedia\.com\b/i },
  { name: 'WikiDoc (wiki)', re: /\bwikidoc\.org\b/i },
  { name: 'LITFL (FOAMed, not peer-reviewed)', re: /\blitfl\.com\b/i },
  { name: 'EMCrit (FOAMed, not peer-reviewed)', re: /\bemcrit\.org\b/i },
  { name: 'EBM Consult (aggregator)', re: /\bebmconsult\.com\b/i },
  { name: 'PrecisePK (vendor)', re: /\bprecisepk\.com\b/i },
  { name: 'Contemporary Pediatrics (magazine)', re: /\bcontemporarypediatrics\.com\b/i },
  { name: 'Expressable (commercial)', re: /\bexpressable\.com\b/i },
  { name: 'Medscape (news / aggregator)', re: /\bmedscape\.com\b/i },
  { name: 'eMedicine (Medscape brand)', re: /emedicine\.medscape\.com/i },
];

const violations = [];

function visit(node, file, slug, trail) {
  if (typeof node === 'string') {
    for (const { name, re } of BLOCKED_PATTERNS) {
      if (re.test(node)) {
        violations.push({ file, slug, source: name, fieldPath: trail.join('.'), value: node.slice(0, 240) });
        break;
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) visit(node[i], file, slug, [...trail, i]);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const localSlug = node.slug || node.id || slug;
  for (const k of Object.keys(node)) visit(node[k], file, localSlug, [...trail, k]);
}

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  visit(data, f, null, []);
}

if (violations.length === 0) {
  console.log('OK — no citations from blocked sources.');
  console.log(
    `(scanned ${BLOCKED_PATTERNS.length} blocked patterns across every bundle JSON)`,
  );
  process.exit(0);
}

console.error(`Citation-source gate FAILED — ${violations.length} non-acceptable citation(s):\n`);
for (const v of violations) {
  console.error(`  [${v.source}]`);
  console.error(`    file: ${v.file}`);
  console.error(`    slug: ${v.slug}`);
  console.error(`    path: ${v.fieldPath}`);
  console.error(`    value: ${v.value}`);
  console.error('');
}
console.error(
  'Replace with a peer-reviewed journal article, society guideline, regulatory label,\n' +
    'NIH/CDC/WHO publication, or recognised formulary (BNF/BNFc/NICE).',
);
process.exit(1);
