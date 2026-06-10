import type { CitationStrength } from '../citation';

/**
 * A record-level rollup of its citations' A–D source-strength tiers, so a
 * clinician (or an integrator's UI) can see the evidence basis of a record at
 * a glance without inspecting each reference. `best` is the strongest tier
 * present (A strongest … D weakest).
 */
export interface EvidenceSummary {
  best: CitationStrength | null;
  counts: { A: number; B: number; C: number; D: number };
  /** References carrying a valid A–D strength. */
  graded: number;
  /** Total references on the record. */
  total: number;
}

const ORDER: CitationStrength[] = ['A', 'B', 'C', 'D'];

/** Compute the evidence summary for a `references[]` array, or null if none. */
export function evidenceSummary(references: unknown): EvidenceSummary | null {
  if (!Array.isArray(references) || references.length === 0) return null;
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  let graded = 0;
  for (const r of references) {
    const s = (r as { strength?: unknown })?.strength;
    if (s === 'A' || s === 'B' || s === 'C' || s === 'D') {
      counts[s] += 1;
      graded += 1;
    }
  }
  const best = ORDER.find((g) => counts[g] > 0) ?? null;
  return { best, counts, graded, total: references.length };
}
