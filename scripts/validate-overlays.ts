#!/usr/bin/env ts-node
/**
 * Overlay-content validator.
 *
 *   npm run overlays:validate
 *
 * Draft country / WHO-baseline overlay content lives OUTSIDE the signed
 * production bundle (content/overlays/_base/*.json for the WHO baseline and
 * content/overlays/<CC>/records/*.json for national overlays). It is authored
 * and validated here, then PROMOTED into a signed bundle release only after
 * clinical review. This validator enforces the safety invariants that make
 * that workflow trustworthy:
 *
 *   1. Every overlay record is jurisdiction-tagged ('WHO' or a supported
 *      country) — overlays must never be ambiguous about who they apply to.
 *   2. No overlay record may be `approved`/`deprecated`. Approval happens on
 *      promotion into a signed bundle after clinical sign-off — draft content
 *      cannot self-approve its way into being served.
 *   3. Every record carries at least one graded citation, and any citation
 *      that declares a `licence` agrees with the source registry (so a
 *      cite-only source can't be relabelled reusable). Mirrors the bundle
 *      licence-compliance gate.
 *
 * Exits non-zero on any violation.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHostIndex, sourceForUrl, loadSourceRegistry } from '../src/modules/localization/source-registry';

const OVERLAYS = resolve(process.cwd(), 'content/overlays');
const VALID_STRENGTH = new Set(['A', 'B', 'C', 'D']);
const SUPPORTED = new Set([
  'WHO',
  'KE',
  'UG',
  'TZ',
  'RW',
  'ET',
  'NG',
  'GH',
  'ZA',
  'ZM',
  'MW',
]);

interface OverlayRecord {
  slug?: string;
  jurisdiction?: string;
  reviewStatus?: string;
  references?: Array<{ url?: string; strength?: string; licence?: string }>;
}

/** Every *.json under content/overlays that holds overlay content records. */
function overlayContentFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(OVERLAYS)) return files;
  const base = resolve(OVERLAYS, '_base');
  if (existsSync(base)) {
    for (const f of readdirSync(base)) if (f.endsWith('.json')) files.push(resolve(base, f));
  }
  for (const entry of readdirSync(OVERLAYS)) {
    const recordsDir = resolve(OVERLAYS, entry, 'records');
    if (existsSync(recordsDir) && statSync(recordsDir).isDirectory()) {
      for (const f of readdirSync(recordsDir))
        if (f.endsWith('.json')) files.push(resolve(recordsDir, f));
    }
  }
  return files;
}

const hostIndex = buildHostIndex(loadSourceRegistry());
const violations: string[] = [];
let recordCount = 0;

for (const file of overlayContentFiles()) {
  const rel = file.slice(process.cwd().length + 1);
  let records: OverlayRecord[];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    violations.push(`${rel}: invalid JSON (${(e as Error).message})`);
    continue;
  }
  for (const rec of records) {
    recordCount += 1;
    const id = `${rel} :: ${rec.slug ?? '(no slug)'}`;
    if (!rec.jurisdiction || !SUPPORTED.has(rec.jurisdiction))
      violations.push(`${id}: missing/unsupported jurisdiction (${rec.jurisdiction ?? 'none'})`);
    if (rec.reviewStatus !== 'draft' && rec.reviewStatus !== 'review')
      violations.push(`${id}: reviewStatus must be 'draft'|'review', got '${rec.reviewStatus ?? 'none'}'`);
    if (!Array.isArray(rec.references) || rec.references.length === 0) {
      violations.push(`${id}: needs at least one citation`);
    } else {
      for (const ref of rec.references) {
        if (!VALID_STRENGTH.has(ref.strength as string))
          violations.push(`${id}: citation missing A–D strength`);
        if (ref.url && ref.licence !== undefined) {
          const src = sourceForUrl(ref.url, hostIndex);
          if (src && ref.licence !== src.citationLicence)
            violations.push(
              `${id}: citation licence '${ref.licence}' ≠ registry '${src.citationLicence}' (${src.id})`,
            );
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Overlay-content validation FAILED — ${violations.length} violation(s):`);
  for (const v of violations.slice(0, 50)) console.error(`  ${v}`);
  if (violations.length > 50) console.error(`  … and ${violations.length - 50} more`);
  process.exit(1);
}

console.log(`OK — ${recordCount} overlay record(s) valid (jurisdiction-tagged, draft/review, cited, licence-compliant).`);
