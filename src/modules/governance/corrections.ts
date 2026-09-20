import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recordContentHash } from './record-hash';

/**
 * Correction proposals: machine-generated, human-approved fixes to bundle
 * content (today: RxNorm codes the audit proved wrong).
 *
 * A proposal never changes the running bundle. Reviewers approve it in the
 * review queue like any record (two named reviewers); scripts/apply-corrections.ts
 * then applies approved proposals to the NEXT bundle version, where the
 * corrected record returns to draft for ordinary review before re-signing.
 */
export const CORRECTIONS_PATH = 'content/corrections/proposals.json';

/** Review-queue domain under which proposals are listed and decided. */
export const CORRECTIONS_DOMAIN = 'corrections';

/**
 * Fields a proposal may change. Deliberately narrow: identifiers the audits
 * can verify against an authoritative terminology service. Clinical text is
 * never machine-corrected.
 */
export const CORRECTABLE_FIELDS = ['rxnorm'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export interface CorrectionProposal {
  /** Stable id, e.g. "rxnorm:hydroxyzine". */
  id: string;
  kind: 'set-field';
  /** Bundle file domain of the record to correct. */
  domain: string;
  recordId: string;
  /** Content hash of the target record the proposal was generated against. */
  baseHash: string;
  changes: Array<{ field: CorrectableField; from: unknown; to: unknown }>;
  rationale: string;
  evidence: Array<{ label: string; url?: string }>;
  generatedBy: string;
}

export interface CorrectionsFile {
  description?: string;
  bundle?: string;
  generatedAt?: string;
  proposals: CorrectionProposal[];
}

function isProposal(p: unknown): p is CorrectionProposal {
  const x = p as CorrectionProposal;
  return (
    !!x &&
    typeof x.id === 'string' &&
    x.kind === 'set-field' &&
    typeof x.domain === 'string' &&
    typeof x.recordId === 'string' &&
    typeof x.baseHash === 'string' &&
    Array.isArray(x.changes) &&
    x.changes.length > 0 &&
    x.changes.every((c) => (CORRECTABLE_FIELDS as readonly string[]).includes(c?.field))
  );
}

/** Load proposals; malformed entries are dropped (and counted) rather than trusted. */
export function loadCorrectionProposals(path = resolve(process.cwd(), CORRECTIONS_PATH)): {
  proposals: CorrectionProposal[];
  rejected: number;
} {
  if (!existsSync(path)) return { proposals: [], rejected: 0 };
  let parsed: CorrectionsFile;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as CorrectionsFile;
  } catch {
    return { proposals: [], rejected: 0 };
  }
  const all = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
  const proposals = all.filter(isProposal);
  return { proposals, rejected: all.length - proposals.length };
}

/**
 * Why a proposal cannot be applied to `record` (empty ⇒ applicable): the
 * record must be exactly the content the proposal was generated against, and
 * each field must still hold the value being replaced.
 */
export function correctionConflicts(
  proposal: CorrectionProposal,
  record: Record<string, unknown> | undefined,
): string[] {
  if (!record) return [`target ${proposal.domain}/${proposal.recordId} not found`];
  const out: string[] = [];
  if (recordContentHash(record) !== proposal.baseHash) {
    out.push('target record changed since the proposal was generated');
  }
  for (const c of proposal.changes) {
    if (JSON.stringify(record[c.field]) !== JSON.stringify(c.from)) {
      out.push(
        `${c.field} is ${JSON.stringify(record[c.field])}, expected ${JSON.stringify(c.from)}`,
      );
    }
  }
  return out;
}

/**
 * Apply a proposal to a copy of the record. The corrected record goes back to
 * draft with its review metadata cleared: its content changed, so any earlier
 * approval no longer describes it.
 */
export function applyCorrection(
  proposal: CorrectionProposal,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...record };
  for (const c of proposal.changes) next[c.field] = c.to;
  next.reviewStatus = 'draft';
  delete next.reviewers;
  delete next.approvedAt;
  return next;
}
