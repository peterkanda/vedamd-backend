/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Sign a content bundle directory.
 *
 * Usage:
 *   npm run bundle:sign -- --bundle content/bundles/v0.1.0 \
 *                          --key dev-keys/private-key.pem \
 *                          --signer vedamd-dev-key-v0
 *
 * The signer:
 *   1. Hashes each non-manifest content file (SHA-256).
 *   2. Writes a manifest listing every content file with its hash.
 *   3. Signs the canonical-JSON serialisation of the manifest with
 *      the supplied Ed25519 private key.
 *   4. Writes manifest.json and manifest.sig into the bundle directory.
 *
 * The bundle directory MUST contain `public-key.pem` (the matching
 * public half of the signing key) so the runtime can verify the
 * signature without out-of-band key distribution.
 */
function arg(argv: string[], name: string, fallback?: string): string {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required argument: ${name}`);
  }
  return argv[i + 1];
}

const argv = process.argv.slice(2);
const bundleDir = resolve(process.cwd(), arg(argv, '--bundle', 'content/bundles/v0.1.0'));
const keyPath = resolve(process.cwd(), arg(argv, '--key', 'dev-keys/private-key.pem'));
const signer = arg(argv, '--signer', 'vedamd-dev-key-v0');
const version = arg(argv, '--version', bundleDir.split('/').pop() ?? 'v0.0.0');
const allowDraft = argv.includes('--allow-draft');

const skipFiles = new Set(['manifest.json', 'manifest.sig', 'public-key.pem']);
const files = readdirSync(bundleDir)
  .filter((f) => f.endsWith('.json') && !skipFiles.has(f))
  .sort();

const fileEntries = files.map((name) => {
  const bytes = readFileSync(resolve(bundleDir, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { name, sha256, size: bytes.byteLength };
});

// Content validation gate — FR-024 enforced at signing time.
{
  // Lazy require to avoid a top-of-file cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateBundle } = require('../src/modules/knowledge/bundle-validator');
  const readOptional = (name: string): unknown[] => {
    try {
      return JSON.parse(readFileSync(resolve(bundleDir, name), 'utf8'));
    } catch {
      return [];
    }
  };
  const bundle = {
    conditions: JSON.parse(readFileSync(resolve(bundleDir, 'conditions.json'), 'utf8')),
    drugs: JSON.parse(readFileSync(resolve(bundleDir, 'drugs.json'), 'utf8')),
    interactions: JSON.parse(readFileSync(resolve(bundleDir, 'drug-interactions.json'), 'utf8')),
    procedures: JSON.parse(readFileSync(resolve(bundleDir, 'procedures.json'), 'utf8')),
    cdsRules: JSON.parse(readFileSync(resolve(bundleDir, 'cds-rules.json'), 'utf8')),
    clinicalScores: readOptional('clinical-scores.json'),
    pgxGuidelines: readOptional('pharmacogenomics.json'),
    drugDiseaseInteractions: readOptional('drug-disease-interactions.json'),
    immunizationSchedule: readOptional('immunization-schedule.json'),
    allergyCrossReactivity: readOptional('allergy-cross-reactivity.json'),
    notifiableDiseases: readOptional('notifiable-diseases.json'),
    referenceRanges: readOptional('reference-ranges.json'),
    antidotes: readOptional('antidotes.json'),
    toxidromes: readOptional('toxidromes.json'),
    anticoagulantReversal: readOptional('anticoagulant-reversal.json'),
    ivCompatibility: readOptional('iv-compatibility.json'),
  };
  const validation = validateBundle(bundle);
  const stats = validation.stats;
  // eslint-disable-next-line no-console
  console.log(
    `Content stats: ${stats.totalRecords} records — ${stats.byStatus.approved} approved / ${stats.byStatus.draft} draft / ${stats.byStatus.review} review / ${stats.byStatus.deprecated} deprecated.`,
  );

  if (!validation.ok) {
    // eslint-disable-next-line no-console
    console.error(`\nContent validation failed with ${validation.violations.length} violation(s):`);
    for (const v of validation.violations.slice(0, 20)) {
      // eslint-disable-next-line no-console
      console.error(`  [${v.domain}/${v.recordId}] ${v.code}: ${v.message}`);
    }
    process.exit(2);
  }

  const nonApproved = stats.byStatus.draft + stats.byStatus.review + stats.byStatus.deprecated;
  if (nonApproved > 0 && !allowDraft) {
    // eslint-disable-next-line no-console
    console.error(
      `\nRefusing to sign: ${nonApproved} record(s) are not 'approved'. ` +
        `Re-run with --allow-draft for a dev bundle, or promote the records first.`,
    );
    process.exit(3);
  }
}

const manifest = {
  version,
  signedBy: signer,
  signedAt: new Date().toISOString(),
  files: fileEntries,
};

// Deterministic JSON serialisation: sort keys at every level so the
// signed payload is reproducible.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

const canonicalManifest = canonical(manifest);
const privateKey = createPrivateKey(readFileSync(keyPath));
const signature = sign(null, Buffer.from(canonicalManifest, 'utf8'), privateKey);

writeFileSync(resolve(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(bundleDir, 'manifest.sig'), signature);

// eslint-disable-next-line no-console
console.log(
  `Signed bundle ${bundleDir} (${files.length} files) — version ${version}, signer ${signer}.`,
);
