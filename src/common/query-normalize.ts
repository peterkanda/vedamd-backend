/**
 * Collapse duplicate query-string parameters to a single value.
 *
 * Fastify parses `?q=a&q=b` into `{ q: ['a', 'b'] }`. Our list endpoints
 * type `q` as an optional string and call `.toLowerCase()` / `.trim()` on
 * it directly, so an array value throws and returns a 500. No GET endpoint
 * consumes array query params, so the safe, uniform fix is to keep the LAST
 * value for any repeated key (matching common proxy behaviour) before the
 * handler runs.
 */
export function collapseQueryArrays(query: unknown): void {
  if (!query || typeof query !== 'object') return;
  const q = query as Record<string, unknown>;
  for (const key of Object.keys(q)) {
    const value = q[key];
    if (Array.isArray(value)) {
      q[key] = value.length > 0 ? value[value.length - 1] : undefined;
    }
  }
}
