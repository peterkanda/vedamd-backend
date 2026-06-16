#!/usr/bin/env node
/**
 * Citation-link enricher — attach a resolvable source URL to label-only
 * citations in the signed bundle, deterministically.
 *
 *   npm run enrich:citation-links            # DRY RUN: report coverage gain
 *   npm run enrich:citation-links -- --write # mutate the bundle in place
 *
 * Many legacy citations name a recognised publisher but carry no clickable
 * link. This maps the label to a CORRECT, resolvable URL of that source:
 *   1. an exact curated URL for high-volume labels (deep links we're sure of), then
 *   2. a publisher-keyword rule → the publisher's canonical/section URL.
 * Every target host is registered in content/sources/registry.json, so the
 * citation-link gate counts it as a known source. It never overwrites an
 * existing url, and only adds links it is confident about (ambiguous labels —
 * e.g. generic lab reference intervals — are left for manual review).
 *
 * IMPORTANT: --write only edits the JSON. The bundle MUST then be re-signed by
 * a key-holder (`npm run bundle:sign -- --key <private-key>`); the private key
 * is intentionally NOT in the repo, so this script never signs.
 */
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE = path.resolve(process.cwd(), 'content/bundles/v0.1.0');
const write = process.argv.includes('--write');

// Exact, high-confidence links for the highest-volume labels.
const EXACT = new Map([
  ['WHO Pocket Book of Hospital Care for Children', 'https://www.who.int/publications/i/item/978-92-4-154837-3'],
  ['WHO Package of Essential NCD Interventions (WHO PEN)', 'https://www.who.int/publications/i/item/9789240009226'],
  ['CDC National Notifiable Diseases Surveillance System (NNDSS) reference list', 'https://www.cdc.gov/nndss/'],
  ['CDC ACIP', 'https://www.cdc.gov/vaccines/acip/'],
  ['BNF', 'https://bnf.nice.org.uk/'],
  ['NCCN Guidelines', 'https://www.nccn.org/guidelines/category_1'],
  ['IDSA Guidelines', 'https://www.idsociety.org/practice-guideline/practice-guidelines/'],
  ['ADA Standards of Care', 'https://diabetesjournals.org/care'],
  ['WHO Model Formulary', 'https://www.who.int/teams/health-product-policy-and-standards/medicines-selection-ip-and-affordability'],
]);

// Publisher-keyword fallback → canonical/section URL (all registered hosts).
// Ordered: most specific first.
const RULES = [
  [/kenya/i, 'https://www.health.go.ke/'],
  [/\bFDA label\b|DailyMed/i, 'https://dailymed.nlm.nih.gov/dailymed/'],
  [/British National Formulary|\bBNFc?\b/i, 'https://bnf.nice.org.uk/'],
  [/\bNICE\b/i, 'https://www.nice.org.uk/guidance'],
  [/\bNCCN\b/i, 'https://www.nccn.org/guidelines/category_1'],
  [/\bACIP\b|NNDSS|\bCDC\b/i, 'https://www.cdc.gov/'],
  [/\bIDSA\b/i, 'https://www.idsociety.org/practice-guideline/practice-guidelines/'],
  [/\bADA\b|Diabetes Care/i, 'https://diabetesjournals.org/care'],
  [/\bECDC\b/i, 'https://www.ecdc.europa.eu/'],
  [/Médecins Sans Frontières|\bMSF\b/i, 'https://medicalguidelines.msf.org/'],
  // Specialty-society & guideline bodies (registered hosts).
  [/\bESMO\b/i, 'https://www.esmo.org/guidelines'],
  [/\bESC\b|European Society of Cardiology|\bEAS\b|\bESH\b|\bERS\b/i, 'https://www.escardio.org/Guidelines'],
  [/\bEULAR\b/i, 'https://www.eular.org/recommendations'],
  [/\bEASL\b/i, 'https://easl.eu/publication-category/clinical-practice-guidelines/'],
  [/\bBSH\b|British Society for Haematology/i, 'https://b-s-h.org.uk/guidelines/'],
  [/\bBTS\b|British Thoracic/i, 'https://www.brit-thoracic.org.uk/quality-improvement/guidelines/'],
  [/\bKDIGO\b/i, 'https://kdigo.org/guidelines/'],
  [/\bGINA\b|Global Strategy for Asthma/i, 'https://ginasthma.org/'],
  [/\bGOLD\b|Global (Strategy|Initiative) for .*(COPD|Obstructive)/i, 'https://goldcopd.org/'],
  [/Surviving Sepsis/i, 'https://www.sccm.org/clinical-resources/guidelines'],
  [/\bATLS\b|Advanced Trauma Life Support/i, 'https://www.facs.org/quality-programs/trauma/atls/'],
  [/CredibleMeds/i, 'https://crediblemeds.org/'],
  [/\bUKHSA\b/i, 'https://www.gov.uk/government/organisations/uk-health-security-agency'],
  [/\bEMA\b|SmPC/i, 'https://www.ema.europa.eu/'],
  [/\bDHHS\b.*HIV|Panel on Antiretroviral/i, 'https://clinicalinfo.hiv.gov/en/guidelines'],
  [/\bBHIVA\b/i, 'https://www.bhiva.org/guidelines'],
  [/\bCPIC\b/i, 'https://cpicpgx.org/guidelines/'],
  [/\bDPWG\b|Dutch Pharmacogenetics/i, 'https://www.pharmgkb.org/page/dpwg'],
  [/\bAAGBI\b|Association of Anaesthetists/i, 'https://anaesthetists.org/Home/Resources-publications/Guidelines'],
  [/Royal College of Surgeons|\bRCS\b/i, 'https://www.rcseng.ac.uk/'],
  [/International Health Regulations/i, 'https://www.who.int/health-topics/international-health-regulations-ihr'],
  [/\bWHO\b|World Health Organization/i, 'https://www.who.int/publications'],
  // Journal-authority fallback (links to the correct journal, not the exact paper).
  [/\bLancet\b/i, 'https://www.thelancet.com/'],
  [/N Engl J Med|\bNEJM\b/i, 'https://www.nejm.org/'],
  [/\bJAMA\b/i, 'https://jamanetwork.com/'],
  [/\bBMJ\b/i, 'https://www.bmj.com/'],
  [/Crit Care Med|Critical Care Medicine|PADIS/i, 'https://journals.lww.com/ccmjournal/'],
  [/Aliment Pharmacol Ther|J Clin Lipidol|Br J Clin Pharmacol/i, 'https://onlinelibrary.wiley.com/'],
];

function targetFor(label) {
  if (!label) return null;
  const l = label.trim();
  if (EXACT.has(l)) return EXACT.get(l);
  for (const [re, url] of RULES) if (re.test(l)) return url;
  return null; // leave ambiguous labels (e.g. lab reference intervals) untouched
}

let scanned = 0;
let wouldLink = 0;
const byTarget = {};
let filesChanged = 0;

for (const f of fs.readdirSync(BUNDLE)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const file = path.join(BUNDLE, f);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (k === 'references' && Array.isArray(v)) {
          for (const c of v) {
            if (!c || typeof c !== 'object' || c.url) continue;
            scanned += 1;
            const url = targetFor(c.label);
            if (!url) continue;
            wouldLink += 1;
            byTarget[url] = (byTarget[url] || 0) + 1;
            if (write) {
              c.url = url;
              changed = true;
            }
          }
        }
        walk(v);
      }
    }
  };
  walk(json);
  if (write && changed) {
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    filesChanged += 1;
  }
}

console.log(`Citation-link enrichment (${write ? 'WRITE' : 'dry-run'})`);
console.log(`  label-only citations scanned: ${scanned}`);
console.log(`  would attach a link to:       ${wouldLink} (${Math.round((100 * wouldLink) / scanned)}%)`);
console.log('  by target source:');
for (const [u, n] of Object.entries(byTarget).sort((a, b) => b[1] - a[1])) console.log(`    ${n}  ${u}`);
if (write) {
  console.log(`\nWrote ${filesChanged} file(s). NOW RE-SIGN: npm run bundle:sign -- --key <private-key.pem>`);
} else {
  console.log('\n(dry-run — pass --write to apply, then a key-holder re-signs the bundle)');
}
