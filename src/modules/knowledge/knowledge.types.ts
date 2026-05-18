import type { ConditionGuidance } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';

export interface BundleManifestFile {
  name: string;
  sha256: string;
  size: number;
}

export interface BundleManifest {
  version: string;
  signedBy: string;
  signedAt: string;
  files: BundleManifestFile[];
}

export interface BundleInfo {
  version: string;
  signedBy: string;
  signedAt: string;
  /** True iff signature and per-file hashes all verified at load time. */
  verified: boolean;
  /** Reason verification failed, or 'ok' on success, or 'skipped' in dev. */
  verificationStatus: 'ok' | 'skipped' | 'signature-invalid' | 'hash-mismatch' | 'missing';
  files: BundleManifestFile[];
}

export interface LoadedBundle {
  info: BundleInfo;
  conditions: ConditionGuidance[];
  drugs: DrugRecord[];
  interactions: DrugInteraction[];
  procedures: ProcedureGuidance[];
}
