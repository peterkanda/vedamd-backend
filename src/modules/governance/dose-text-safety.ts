/**
 * Per-kg dose screen used by the release-readiness report.
 *
 * Same rules as scripts/check-clinical-safety.js (category B): a record whose
 * text states a per-kg dose but never a maximum/ceiling. Titrated per-kg
 * infusion RATES are a different construct and excluded. The two copies are
 * kept in step by test/release-readiness.spec.ts, which compares counts.
 *
 * Most hits are appropriately uncapped specialist or weight-based doses, not
 * errors (content/validation/opus-safety-review.md) — this measures review
 * workload, it does not assert defects.
 */
const PER_KG = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|micrograms?|units?|iu|ml)\s?\/\s?kg\b/i;
const PER_KG_RATE = /\/\s?kg\s?\/\s?(?:min|sec|hour|hr|h|day|24\s?h|dose)/i;
const HAS_MAX = /\b(max|maximum|not exceed|up to|ceiling|cap\b)/i;

function allText(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => allText(n, acc));
  else if (node && typeof node === 'object') for (const v of Object.values(node)) allText(v, acc);
  return acc;
}

/** True when the record states a per-kg dose (not a titrated rate) with no stated maximum. */
export function hasUncappedPerKgDose(record: unknown): boolean {
  const text = allText(record).join(' • ');
  return PER_KG.test(text) && !HAS_MAX.test(text) && !PER_KG_RATE.test(text);
}
