import { createHash } from 'node:crypto';

/**
 * Review metadata — changes when a record is reviewed or promoted, so it is
 * excluded from the content hash. Everything else is clinical content: any
 * change to it makes earlier review decisions stale.
 */
const REVIEW_FIELDS = new Set(['reviewStatus', 'reviewers', 'approvedAt', 'lastReviewedAt']);

function canonical(value: unknown, top = true): unknown {
  if (Array.isArray(value)) return value.map((v) => canonical(v, false));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (top && REVIEW_FIELDS.has(key)) continue;
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonical(v, false);
    }
    return out;
  }
  return value;
}

/**
 * Stable sha256 of a content record's clinical content (key order and review
 * metadata ignored). A review decision pins this hash, so the decision only
 * applies to the exact content the reviewer saw.
 */
export function recordContentHash(record: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(record)))
    .digest('hex');
}

/**
 * The key a review decision and scripts/promote-bundle.ts use to address a
 * record: `slug`, else `id` (cds-rules), else the order-independent drug pair
 * `a+b` for drug-interaction records, which carry `slugA`/`slugB` only.
 */
export function recordKey(record: unknown): string | undefined {
  const r = (record ?? {}) as Record<string, unknown>;
  if (typeof r.slug === 'string' && r.slug) return r.slug;
  if (typeof r.id === 'string' && r.id) return r.id;
  if (typeof r.slugA === 'string' && typeof r.slugB === 'string' && r.slugA && r.slugB) {
    return [r.slugA, r.slugB].sort().join('+');
  }
  return undefined;
}
