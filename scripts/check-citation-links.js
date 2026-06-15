#!/usr/bin/env node
/**
 * Citation-link traceability gate — patient-safety provenance.
 *
 *   npm run check:citation-links            # report
 *   npm run check:citation-links -- --worklist   # + write the fill-in worklist
 *   npm run check:citation-links -- --strict     # fail if either ratchet grows (CI)
 *
 * A clinician must be able to click through to the source behind a
 * recommendation. This scans every clinical record (signed bundle + country
 * overlays) and enforces two ratchets that only move DOWN:
 *   1. RECORDS WITHOUT A CLICKABLE CITATION — a record whose references carry no
 *      resolvable URL. New content must link its sources (the overlays already
 *      do, 100%); the legacy bundle is the backlog this drives down.
 *   2. CITATION URL → UNKNOWN HOST — a link whose host is not a recognised,
 *      licence-classified source in content/sources/registry.json (so we can't
 *      confirm the cited source is what it claims to be).
 *
 * Lower the ceilings as links are added. It does NOT fetch URLs (liveness is a
 * separate check, scripts/audit-urls.js); it verifies presence + recognition.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const BUNDLE = path.resolve(ROOT, 'content/bundles/v0.1.0');
const OVERLAYS = path.resolve(ROOT, 'content/overlays');
const REGISTRY = path.resolve(ROOT, 'content/sources/registry.json');
const strict = process.argv.includes('--strict');

// Ratchet ceilings (current state). Only ever lower these.
const MAX_RECORDS_WITHOUT_LINK = 5086; // legacy bundle records citing by label only
const MAX_UNKNOWN_HOST = 0; // every cited URL host is registry-recognised

const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const hostIndex = new Map();
for (const s of reg.sources) for (const h of s.hosts || []) hostIndex.set(h.toLowerCase(), s);
function knownHost(url) {
  let h;
  try {
    h = new URL(url).hostname.toLowerCase();
  } catch {
    return true; // not a URL we parse — not counted as an unknown host
  }
  let c = h;
  while (c.includes('.')) {
    if (hostIndex.has(c)) return true;
    c = c.slice(c.indexOf('.') + 1);
  }
  return hostIndex.has(c);
}

function recordsOf(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(parsed) ? parsed : parsed.records ?? Object.values(parsed).find(Array.isArray) ?? [];
  return Array.isArray(arr) ? arr.filter((r) => r && typeof r === 'object' && 'references' in r) : [];
}
function jsonFiles(dir, skip = []) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsonFiles(p, skip));
    else if (e.name.endsWith('.json') && !skip.includes(e.name)) out.push(p);
  }
  return out;
}

const noLink = []; // records lacking any clickable citation
let unknownHostCount = 0;
const scan = (files, base) => {
  for (const file of files) {
    for (const rec of recordsOf(file)) {
      const refs = Array.isArray(rec.references) ? rec.references : [];
      let clickable = false;
      for (const c of refs) {
        if (c && c.url) {
          clickable = true;
          if (!knownHost(c.url)) unknownHostCount++;
        }
      }
      if (!clickable) noLink.push({ file: path.relative(base, file), slug: rec.slug || rec.id });
    }
  }
};
scan(jsonFiles(BUNDLE, ['manifest.json']), ROOT);
scan(jsonFiles(OVERLAYS, ['manifest.json', 'overlay.json', 'provenance.json']), ROOT);

console.log('Citation-link traceability');
console.log(`  records lacking a clickable citation: ${noLink.length} (ratchet ≤ ${MAX_RECORDS_WITHOUT_LINK})`);
console.log(`  citation URLs → unknown host:          ${unknownHostCount} (ratchet ≤ ${MAX_UNKNOWN_HOST})`);

if (process.argv.includes('--worklist')) {
  const byFile = {};
  for (const r of noLink) (byFile[r.file] ||= []).push(r.slug);
  const md = [
    '# Citation-link worklist',
    '',
    'Records that cite a source by label only (no clickable URL). Add a resolvable',
    'link to a registered source so a clinician can verify the recommendation.',
    `Total: ${noLink.length}.`,
    '',
    ...Object.entries(byFile)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([f, slugs]) => `- **${f}** — ${slugs.length} record(s)`),
  ].join('\n');
  fs.mkdirSync(path.resolve(ROOT, 'content/safety'), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, 'content/safety/citation-link-worklist.md'), `${md}\n`);
  console.log(`  wrote content/safety/citation-link-worklist.md`);
}

const failures = [];
if (noLink.length > MAX_RECORDS_WITHOUT_LINK)
  failures.push(`records-without-link grew to ${noLink.length} (ceiling ${MAX_RECORDS_WITHOUT_LINK})`);
if (unknownHostCount > MAX_UNKNOWN_HOST)
  failures.push(`unknown-host citations grew to ${unknownHostCount} (ceiling ${MAX_UNKNOWN_HOST})`);
if (strict && failures.length) {
  console.error(`\nFAILED (--strict): ${failures.join('; ')}.`);
  process.exit(1);
}
console.log('\n(report mode — pass --strict to enforce the ratchets)');
