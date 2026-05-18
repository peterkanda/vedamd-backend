import type { CdsRule, ConditionGuidance } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';
import type { ContentStats, ValidationViolation } from './bundle-validator';

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

export type BundleVerificationStatus =
  | 'ok'
  | 'skipped'
  | 'signature-invalid'
  | 'hash-mismatch'
  | 'missing'
  | 'content-validation-failed'
  | 'non-approved-content';

export interface BundleInfo {
  version: string;
  signedBy: string;
  signedAt: string;
  /** True iff signature + per-file hashes + content validation all passed and any configured approval gate is satisfied. */
  verified: boolean;
  verificationStatus: BundleVerificationStatus;
  files: BundleManifestFile[];
  /** Tallies of records by review status and domain. */
  contentStats?: ContentStats;
  /** Up to N validation violations (truncated by the loader to keep responses small). */
  contentViolations?: ValidationViolation[];
  /** When true, runtime requires every record to be reviewStatus='approved'. */
  requireApproved?: boolean;
}

export interface LoadedBundle {
  info: BundleInfo;
  conditions: ConditionGuidance[];
  drugs: DrugRecord[];
  interactions: DrugInteraction[];
  procedures: ProcedureGuidance[];
  cdsRules: CdsRule[];
}
