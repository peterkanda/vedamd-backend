#!/usr/bin/env node
/**
 * Licence-compliance gate (copyright register enforcement).
 *
 * VedaMD content is licensed CC BY-NC-SA 4.0 (content/LICENSE). The registry
 * (content/sources/registry.json) records, per upstream source, whether it may
 * be embedded under that licence and how (`reuseMode`: adapt / verbatim /
 * separate / cite-only). Some attractive sources (MSF, most Kenya MoH
 * guidelines, NICE, SNOMED, ATC/DDD, DrugBank full) stay cite-only. This gate
 * turns that from prose guidance into an enforced invariant by cross-checking
 * every citation against the registry:
 *
 *   1. LABEL INTEGRITY — a citation whose URL maps to a known source must, if
 *      it declares a `licence`, declare the SAME licence the registry assigns
 *      (or, for a `per-item` source such as PMC or WHO IRIS, one of its
 *      `itemLicences`). Stops a `moh-restricted`/`proprietary` source being
 *      relabelled `public-domain` to sneak reproduction past review.
 *   2. CENSUS — tallies citations by embeddable verdict so reviewers can see
 *      how much of the bundle leans on cite-only sources.
 *
 * Policy: WARN-NOW, ENFORCE-LATER. By default this reports and exits 0 so the
 * build is not broken while provenance is backfilled; the ratchet ceiling
 * lives in test/licence-compliance.spec.ts and only moves down. Pass
 * `--enforce` (CI, once clean) to exit non-zero on any mismatch.
 */
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE = path.resolve(__dirname, '../content/bundles/v0.1.0');
const REGISTRY = path.resolve(__dirname, '../content/sources/registry.json');
const enforce = process.argv.includes('--enforce');

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

// Host → source index (lower-cased). Longest suffix wins via the strip loop.
// `urlPrefixes` (host + path, keys containing '/') win over any host match.
// Mirrors sourceForUrl in src/modules/localization/source-registry.ts.
const hostIndex = new Map();
for (const src of registry.sources) {
  for (const host of src.hosts || []) hostIndex.set(host.toLowerCase(), src);
  for (const prefix of src.urlPrefixes || []) hostIndex.set(prefix.toLowerCase(), src);
}

function sourceForUrl(url) {
  let host;
  let hostPath;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    hostPath = host.replace(/^www\./, '') + parsed.pathname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, src] of hostIndex) {
    if (key.includes('/') && hostPath.startsWith(key)) return src;
  }
  let candidate = host;
  while (candidate.includes('.')) {
    const hit = hostIndex.get(candidate);
    if (hit) return hit;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return hostIndex.get(candidate) ?? null;
}

/** Collect every citation object (element of a `references` array). */
function collectCitations() {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'references' && Array.isArray(v)) {
          for (const c of v) if (c && typeof c === 'object') out.push(c);
        }
        walk(v);
      }
    }
  };
  for (const f of fs.readdirSync(BUNDLE)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    walk(JSON.parse(fs.readFileSync(path.join(BUNDLE, f), 'utf8')));
  }
  return out;
}

/** A declared licence agrees with the source's (or, per-item, with one of its item licences). */
function licenceAgrees(src, declared) {
  if (src.licenceScope === 'per-item') return (src.itemLicences || []).includes(declared);
  return declared === src.citationLicence;
}

const cites = collectCitations();

const census = { yes: 0, verify: 0, 'cite-only': 0, unregistered: 0, 'no-url': 0 };
const mismatches = [];

for (const c of cites) {
  if (!c.url) {
    census['no-url'] += 1;
    continue;
  }
  const src = sourceForUrl(c.url);
  if (!src) {
    census.unregistered += 1;
    continue;
  }
  census[src.embeddable] += 1;
  if (c.licence !== undefined && !licenceAgrees(src, c.licence)) {
    mismatches.push({
      label: String(c.label || '').slice(0, 80),
      url: c.url,
      declared: c.licence,
      registry: src.citationLicence,
      source: src.id,
    });
  }
}

console.log(`Licence census over ${cites.length} citations:`);
console.log(
  `  embeddable=yes:${census.yes}  verify:${census.verify}  cite-only:${census['cite-only']}` +
    `  unregistered-host:${census.unregistered}  no-url:${census['no-url']}`,
);

// ─── Reference labels (content/labels/) ────────────────────────────────────
// Stored manufacturer-label TEXT may only come from an embeddable source, and
// link-only files must not carry text. Unlike the citation census this is
// enforced from day one: the lane is new, so there is no legacy to ratchet.
const labelsArg = process.argv.indexOf('--labels');
const LABELS =
  labelsArg >= 0
    ? path.resolve(process.cwd(), process.argv[labelsArg + 1])
    : path.resolve(__dirname, '../content/labels');
const sourceById = new Map(registry.sources.map((s) => [s.id, s]));
const labelViolations = [];
const TEXT_KEYS = ['sections', 'text', 'excerpt', 'body'];

function checkLabelFile(file) {
  const full = path.join(LABELS, file);
  if (!fs.existsSync(full)) return 0;
  const records = JSON.parse(fs.readFileSync(full, 'utf8'));
  for (const r of records) {
    const where = `${file}:${r.slug ?? '?'}`;
    const urls = [r.url, r.citation && r.citation.url].filter(Boolean);
    const hostSources = urls.map((u) => sourceForUrl(u));
    if (hostSources.some((s) => !s)) labelViolations.push(`${where} — URL host not in registry`);
    const hasText = TEXT_KEYS.some((k) => r[k] !== undefined);
    if (!hasText) continue;
    const declared = sourceById.get(r.source);
    if (!declared) {
      labelViolations.push(`${where} — stores text but source "${r.source}" is not in the registry`);
      continue;
    }
    if (declared.embeddable !== 'yes') {
      labelViolations.push(`${where} — stores text from "${declared.id}" (embeddable: ${declared.embeddable})`);
    }
    for (const s of hostSources) {
      if (s && s.embeddable !== 'yes') {
        labelViolations.push(`${where} — cites "${s.id}" (embeddable: ${s.embeddable}) alongside stored text`);
      }
    }
    const citeSource = r.citation && r.citation.url ? sourceForUrl(r.citation.url) : null;
    if (citeSource && r.citation.licence !== undefined && !licenceAgrees(citeSource, r.citation.licence)) {
      labelViolations.push(`${where} — citation licence ${r.citation.licence} ≠ registry ${citeSource.citationLicence}`);
    }
  }
  return records.length;
}

if (fs.existsSync(LABELS)) {
  const counted = fs
    .readdirSync(LABELS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${f}:${checkLabelFile(f)}`);
  console.log(`Reference labels checked: ${counted.join('  ') || 'none'}`);
  if (labelViolations.length > 0) {
    console.error(`\nReference-label licence FAILED — ${labelViolations.length} violation(s):`);
    for (const v of labelViolations.slice(0, 40)) console.error(`  ${v}`);
    process.exitCode = 1;
  }
}

if (mismatches.length > 0) {
  const verb = enforce ? 'FAILED' : 'WARNING';
  console.error(`\nLicence-label ${verb} — ${mismatches.length} citation(s) disagree with registry:`);
  for (const m of mismatches.slice(0, 40)) {
    console.error(
      `  [${m.source}] declared=${m.declared} registry=${m.registry}  "${m.label}…"  ${m.url}`,
    );
  }
  if (mismatches.length > 40) console.error(`  … and ${mismatches.length - 40} more`);
  if (enforce) process.exit(1);
  console.error('\n(warn mode — pass --enforce to fail the build once clean)');
} else {
  console.log('OK — every registered-host citation agrees with the registry licence.');
}
