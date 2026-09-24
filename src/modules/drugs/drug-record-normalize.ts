import type { DrugRecord, RenalAdjustment } from './drugs.types';

/**
 * Normalise drug records so the clinical consumers (dosing calculator, renal
 * and pregnancy rules, safety review — all via DrugsService) see one shape.
 * Mutates the records it is given: pass copies. The knowledge service keeps
 * the signed originals untouched, since governance compares record hashes.
 *
 * The signed bundle cannot be edited without re-signing, and several shapes
 * in it silently disabled safety checks:
 *  - 75 renal bands use `creatinineClearanceMin/Max` instead of
 *    `crClMinMlMin/MaxMlMin`. With both bounds unread, a band matched every
 *    CrCl, so the first band of those drugs applied to everyone.
 *  - Most renal bands were written with inclusive integer bounds (0–29, 30–59)
 *    but were matched as exclusive, so a CrCl of exactly 29 matched nothing.
 *  - "AVOID" / "CONTRAINDICATED" bands carried no `prohibited` flag, so the
 *    renal rule (which fires only on prohibited) never warned.
 *  - `dosing.renal` as a string, or `pregnancy` as a string or null, made the
 *    renal / pregnancy rules throw — and a throwing rule dropped every card it
 *    would have produced for the other drugs in the request.
 *
 * Returns one line per record it had to repair, for the load log and the
 * content team.
 */
export function normalizeDrugRecords(drugs: DrugRecord[]): string[] {
  const issues: string[] = [];
  for (const d of drugs) {
    const dosing = (d.dosing ?? {}) as DrugRecord['dosing'];
    d.dosing = dosing;
    const rawRenal: unknown = dosing.renal;
    if (rawRenal !== undefined && !Array.isArray(rawRenal)) {
      issues.push(`${d.slug}: dosing.renal is not a list of bands; ignored`);
    }
    const { bands, repaired } = normalizeRenalBands(rawRenal);
    if (repaired) issues.push(`${d.slug}: renal bands repaired (${repaired})`);
    dosing.renal = bands;

    const rawPregnancy: unknown = d.pregnancy;
    if (typeof rawPregnancy === 'string') {
      d.pregnancy = {
        notes: rawPregnancy,
        // Only an unqualified leading "Contraindicated" sets the flag; any
        // other wording stays narrative for the clinician to read.
        contraindicated: /^\s*contraindicated\b/i.test(rawPregnancy),
      };
      issues.push(`${d.slug}: pregnancy was a string`);
    } else if (rawPregnancy === null || typeof rawPregnancy !== 'object') {
      d.pregnancy = { notes: '' };
      issues.push(`${d.slug}: pregnancy missing`);
    }
  }
  return issues;
}

// An adjustment that starts with one of these means "do not use at this
// renal function", unless it is qualified (see below).
const PROHIBITIVE = /^\s*(avoid|contraindicated|do not use)\b/i;
// Qualified avoidance ("where possible", "unless …", route- or
// indication-specific) is a caution, not a prohibition.
const QUALIFIED = /where possible|unless|initiation|prophylaxis|\bIM\b|indication/i;

function normalizeRenalBands(raw: unknown): { bands: RenalAdjustment[]; repaired: string } {
  if (!Array.isArray(raw)) return { bands: [], repaired: '' };
  const fixes = new Set<string>();

  const bands: RenalAdjustment[] = raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => {
      const min = num(b.crClMinMlMin) ?? num(b.creatinineClearanceMin);
      const max = num(b.crClMaxMlMin) ?? num(b.creatinineClearanceMax);
      if (b.crClMinMlMin === undefined && b.creatinineClearanceMin !== undefined) {
        fixes.add('creatinineClearance* keys');
      }
      if (b.crClMaxMlMin === undefined && b.creatinineClearanceMax !== undefined) {
        fixes.add('creatinineClearance* keys');
      }
      const adjustment = typeof b.adjustment === 'string' ? b.adjustment : '';
      const flagged = b.prohibited === true;
      const avoid = PROHIBITIVE.test(adjustment);
      const prohibited = flagged || (avoid && !QUALIFIED.test(adjustment));
      const caution = !prohibited && avoid;
      if (!flagged && prohibited) fixes.add('unflagged AVOID/CONTRAINDICATED');
      return {
        crClMinMlMin: min,
        crClMaxMlMin: max,
        adjustment,
        ...(prohibited ? { prohibited: true } : {}),
        ...(caution ? { caution: true } : {}),
      };
    });

  // Bounds were authored two ways. Where one band's max equals another's min
  // (30 / 30) the author meant half-open ranges; otherwise (29 / 30) they
  // meant inclusive integers, and a CrCl of 29.5 belongs to the lower band.
  // A lone band is read inclusively too, which errs towards warning at its
  // boundary rather than missing it.
  const mins = new Set(bands.map((b) => b.crClMinMlMin).filter((v) => v !== undefined));
  const halfOpen = bands.some((b) => b.crClMaxMlMin !== undefined && mins.has(b.crClMaxMlMin));
  for (const b of bands) {
    if (b.crClMaxMlMin !== undefined) {
      b.crClMaxExclusive = halfOpen ? b.crClMaxMlMin : b.crClMaxMlMin + 1;
    }
  }
  return { bands, repaired: [...fixes].join(', ') };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
