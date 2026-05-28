import { SetMetadata } from '@nestjs/common';

/**
 * Marks a GET route as serving immutable, signed-bundle-derived content.
 *
 * The response for such a route is fully determined by (bundle version,
 * path, query) — it cannot change until a new signed bundle is deployed
 * (which bumps the version). ContentCacheInterceptor uses this to attach
 * a strong ETag + long Cache-Control and to answer If-None-Match with a
 * 304 BEFORE the handler runs — so a cache hit skips the (potentially
 * multi-megabyte) serialization entirely.
 *
 * Apply ONLY to anonymous, non-PHI, read-only content endpoints.
 */
export const IMMUTABLE_CONTENT = 'vedamd:immutable-content';

export interface ImmutableContentOptions {
  /** Cache-Control max-age in seconds. Default 3600 (1h). */
  maxAgeSeconds?: number;
}

export const ImmutableContent = (options: ImmutableContentOptions = {}) =>
  SetMetadata(IMMUTABLE_CONTENT, { maxAgeSeconds: options.maxAgeSeconds ?? 3600 });
