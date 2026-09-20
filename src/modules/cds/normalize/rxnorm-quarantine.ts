import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QuarantinedCode } from './code-resolver';

/** Written by `npm run audit:drug-rxnorm`; see content/safety/rxnorm-code-audit.md. */
export const RXNORM_QUARANTINE_PATH = 'content/safety/rxnorm-quarantine.json';

export interface QuarantineLoadResult {
  entries: QuarantinedCode[];
  /** Why nothing (or less than the file) was loaded, for the startup log. */
  warning?: string;
}

/**
 * Load the RxNorm quarantine. Deny-only — it can remove a drug record's claim
 * on a code but never add a mapping — so it is read from outside the signed
 * bundle. A missing or malformed file yields an empty list plus a warning,
 * which is exactly the pre-quarantine behaviour; malformed entries are
 * skipped individually rather than discarding the whole list.
 */
export function loadRxNormQuarantine(
  path = resolve(process.cwd(), RXNORM_QUARANTINE_PATH),
): QuarantineLoadResult {
  if (!existsSync(path)) return { entries: [], warning: `no quarantine file at ${path}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { entries: [], warning: `unreadable quarantine file: ${(e as Error).message}` };
  }
  const codes = (parsed as { codes?: unknown })?.codes;
  if (!Array.isArray(codes)) return { entries: [], warning: 'quarantine file has no codes[]' };
  const entries: QuarantinedCode[] = [];
  let skipped = 0;
  for (const c of codes) {
    const code = (c as { code?: unknown })?.code;
    const slug = (c as { slug?: unknown })?.slug;
    if (typeof code === 'string' && code.trim() && typeof slug === 'string' && slug.trim()) {
      entries.push({ code: code.trim(), slug: slug.trim() });
    } else {
      skipped += 1;
    }
  }
  return {
    entries,
    ...(skipped
      ? { warning: `skipped ${skipped} malformed quarantine entr${skipped === 1 ? 'y' : 'ies'}` }
      : {}),
  };
}
