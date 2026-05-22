import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CdsRule, ConditionGuidance } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';
import type { ClinicalScore } from '../clinical-scores/clinical-scores.types';
import type { PgxGuideline } from '../pharmacogenomics/pharmacogenomics.types';
import type { DrugDiseaseInteraction } from '../drug-disease/drug-disease.types';
import type { ImmunizationScheduleEntry } from '../immunization/immunization.types';
import type { AllergyCrossReactivity } from '../allergy/allergy.types';
import type { NotifiableDisease } from '../notifiable/notifiable.types';
import type { ReferenceRange } from '../reference-ranges/reference-ranges.types';
import type { Antidote } from '../antidotes/antidotes.types';
import type { TerminologyBundle } from '../terminology/terminology.types';
import { nonApprovedCount, validateBundle } from './bundle-validator';
import type {
  BundleInfo,
  BundleManifest,
  BundleManifestFile,
  BundleVerificationStatus,
  LoadedBundle,
} from './knowledge.types';

export interface BundleLoadOptions {
  /** Refuse to load a bundle that fails verification. Production default. */
  strict: boolean;
  /** When true, refuse to load if any record is not reviewStatus='approved'. */
  requireApproved?: boolean;
}

/** Cap on how many violations the loader stuffs into BundleInfo. */
const MAX_REPORTED_VIOLATIONS = 50;

/**
 * Deterministic JSON serialisation: sort keys at every level. The
 * signer uses the same function; verification must match byte-for-byte.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Load and (optionally) verify a content bundle from a directory.
 *
 * Returns the parsed records plus a BundleInfo describing what was
 * verified. In strict mode any verification failure throws; in
 * non-strict mode the bundle still loads but BundleInfo.verified is
 * false and verificationStatus reports the cause.
 *
 * Verification has three layers:
 *   1. Ed25519 signature of the canonical-JSON manifest.
 *   2. SHA-256 of each content file matches the manifest entry.
 *   3. All four expected content files are present.
 */
export function loadBundleFromDisk(dir: string, opts: BundleLoadOptions): LoadedBundle {
  const manifestPath = resolve(dir, 'manifest.json');
  const sigPath = resolve(dir, 'manifest.sig');
  const pubKeyPath = resolve(dir, 'public-key.pem');

  let manifestRaw: Buffer;
  let manifestParsed: BundleManifest;
  try {
    manifestRaw = readFileSync(manifestPath);
    manifestParsed = JSON.parse(manifestRaw.toString('utf8')) as BundleManifest;
  } catch (e) {
    return failOrReturn(opts, 'missing', dir, e);
  }

  // Verify signature against canonical manifest.
  let signatureOk = false;
  try {
    const signature = readFileSync(sigPath);
    const publicKey = createPublicKey(readFileSync(pubKeyPath));
    signatureOk = verify(
      null,
      Buffer.from(canonicalJson(manifestParsed), 'utf8'),
      publicKey,
      signature,
    );
  } catch (e) {
    return failOrReturn(opts, 'signature-invalid', dir, e, manifestParsed);
  }
  if (!signatureOk) {
    return failOrReturn(opts, 'signature-invalid', dir, undefined, manifestParsed);
  }

  // Verify each file's hash and load it.
  const filesByName = new Map<string, BundleManifestFile>(
    manifestParsed.files.map((f) => [f.name, f]),
  );
  const required = [
    'conditions.json',
    'drugs.json',
    'drug-interactions.json',
    'procedures.json',
    'cds-rules.json',
  ];
  for (const name of required) {
    if (!filesByName.has(name)) {
      return failOrReturn(
        opts,
        'missing',
        dir,
        new Error(`Manifest missing required file: ${name}`),
        manifestParsed,
      );
    }
  }

  const parsed: Record<string, unknown> = {};
  for (const [name, entry] of filesByName) {
    const bytes = readFileSync(resolve(dir, name));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256) {
      return failOrReturn(
        opts,
        'hash-mismatch',
        dir,
        new Error(`Hash mismatch for ${name}`),
        manifestParsed,
      );
    }
    parsed[name] = JSON.parse(bytes.toString('utf8'));
  }

  const bundleContent = {
    conditions: parsed['conditions.json'] as ConditionGuidance[],
    drugs: parsed['drugs.json'] as DrugRecord[],
    interactions: parsed['drug-interactions.json'] as DrugInteraction[],
    procedures: parsed['procedures.json'] as ProcedureGuidance[],
    cdsRules: parsed['cds-rules.json'] as CdsRule[],
    clinicalScores: (parsed['clinical-scores.json'] as ClinicalScore[] | undefined) ?? [],
    pgxGuidelines: (parsed['pharmacogenomics.json'] as PgxGuideline[] | undefined) ?? [],
    drugDiseaseInteractions:
      (parsed['drug-disease-interactions.json'] as DrugDiseaseInteraction[] | undefined) ?? [],
    immunizationSchedule:
      (parsed['immunization-schedule.json'] as ImmunizationScheduleEntry[] | undefined) ?? [],
    allergyCrossReactivity:
      (parsed['allergy-cross-reactivity.json'] as AllergyCrossReactivity[] | undefined) ?? [],
    notifiableDiseases:
      (parsed['notifiable-diseases.json'] as NotifiableDisease[] | undefined) ?? [],
    referenceRanges: (parsed['reference-ranges.json'] as ReferenceRange[] | undefined) ?? [],
    antidotes: (parsed['antidotes.json'] as Antidote[] | undefined) ?? [],
    terminology:
      (parsed['terminology.json'] as TerminologyBundle | undefined) ??
      ({ version: '0.0.0-absent', codeSystems: [], valueSets: [] } as TerminologyBundle),
  };

  // Content validation — FR-024 governance rules.
  const validation = validateBundle(bundleContent);

  if (!validation.ok) {
    return failOrReturn(
      opts,
      'content-validation-failed',
      dir,
      new Error(`${validation.violations.length} content validation violation(s)`),
      manifestParsed,
      validation.stats,
      validation.violations,
    );
  }

  // Approval gate — refuse non-approved content in approved-only mode.
  if (opts.requireApproved && nonApprovedCount(validation.stats) > 0) {
    return failOrReturn(
      opts,
      'non-approved-content',
      dir,
      new Error(
        `Bundle contains ${nonApprovedCount(validation.stats)} non-approved record(s); requireApproved is on.`,
      ),
      manifestParsed,
      validation.stats,
      [],
    );
  }

  const info: BundleInfo = {
    version: manifestParsed.version,
    signedBy: manifestParsed.signedBy,
    signedAt: manifestParsed.signedAt,
    verified: true,
    verificationStatus: 'ok',
    files: manifestParsed.files,
    contentStats: validation.stats,
    requireApproved: opts.requireApproved,
  };

  return { info, ...bundleContent };
}

/**
 * Construct an empty / unverified bundle for tests and dev-mode fallbacks.
 */
export function emptyBundle(reason: BundleInfo['verificationStatus']): LoadedBundle {
  return {
    info: {
      version: 'unloaded',
      signedBy: '',
      signedAt: '',
      verified: false,
      verificationStatus: reason,
      files: [],
    },
    conditions: [],
    drugs: [],
    interactions: [],
    procedures: [],
    cdsRules: [],
    clinicalScores: [],
    pgxGuidelines: [],
    drugDiseaseInteractions: [],
    immunizationSchedule: [],
    allergyCrossReactivity: [],
    notifiableDiseases: [],
    referenceRanges: [],
    antidotes: [],
    terminology: { version: '0.0.0-absent', codeSystems: [], valueSets: [] },
  };
}

function failOrReturn(
  opts: BundleLoadOptions,
  status: BundleVerificationStatus,
  dir: string,
  cause: unknown,
  manifest?: BundleManifest,
  stats?: import('./bundle-validator').ContentStats,
  violations?: import('./bundle-validator').ValidationViolation[],
): LoadedBundle {
  if (opts.strict) {
    const msg = `Content bundle verification failed (${status}) at ${dir}`;
    throw cause instanceof Error ? new Error(`${msg}: ${cause.message}`) : new Error(msg);
  }
  return {
    info: {
      version: manifest?.version ?? 'unloaded',
      signedBy: manifest?.signedBy ?? '',
      signedAt: manifest?.signedAt ?? '',
      verified: false,
      verificationStatus: status,
      files: manifest?.files ?? [],
      contentStats: stats,
      contentViolations: violations?.slice(0, MAX_REPORTED_VIOLATIONS),
      requireApproved: opts.requireApproved,
    },
    conditions: [],
    drugs: [],
    interactions: [],
    procedures: [],
    cdsRules: [],
    clinicalScores: [],
    pgxGuidelines: [],
    drugDiseaseInteractions: [],
    immunizationSchedule: [],
    allergyCrossReactivity: [],
    notifiableDiseases: [],
    referenceRanges: [],
    antidotes: [],
    terminology: { version: '0.0.0-absent', codeSystems: [], valueSets: [] },
  };
}
