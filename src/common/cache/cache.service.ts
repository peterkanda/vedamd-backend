import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { REDIS, type MaybeRedis } from './cache.module';

interface MemoEntry {
  value: string;
  expiresAt: number;
}

/**
 * Stateless-safe cache for derived, recomputable values (e.g. deterministic
 * CDS results keyed by a hash of the normalised request). NEVER store
 * patient identifiers, free text, or anything that would re-introduce PHI
 * — keys are HMAC-of-payload hashes and values are de-identified server
 * artefacts.
 *
 * Backends:
 *   - Redis (REDIS_URL set): shared across processes.
 *   - In-memory LRU (no REDIS_URL): per-process; fine for dev / single-
 *     instance deployments. Bounded so a long-running pod can't bloat.
 *
 * On Redis errors we degrade silently to a cache miss — correctness is
 * preserved because every cached value is also recomputable from the
 * signed bundle + request.
 */
@Injectable()
export class CacheService {
  private readonly nestLogger = new Logger(CacheService.name);
  private readonly memo = new Map<string, MemoEntry>();
  private readonly maxMemoEntries = 5_000;
  private readonly fallbackPrefix = 'vmd:';

  constructor(@Optional() @Inject(REDIS) private readonly redis: MaybeRedis) {
    if (!this.redis) {
      this.nestLogger.log(
        'CacheService running with IN-MEMORY LRU (no REDIS_URL). Set REDIS_URL for shared cache.',
      );
    }
  }

  enabled(): boolean {
    return this.redis !== null;
  }

  /** Stable hash for arbitrary JSON-serialisable input (used as cache key). */
  hashKey(prefix: string, input: unknown): string {
    const json = stableStringify(input);
    const digest = createHash('sha256').update(json).digest('hex').slice(0, 32);
    return `${this.fallbackPrefix}${prefix}:${digest}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (err) {
        this.nestLogger.warn(`Redis GET failed (${key}): ${(err as Error).message}`);
        return null;
      }
    }
    const entry = this.memo.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memo.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const json = JSON.stringify(value);
    if (this.redis) {
      try {
        await this.redis.set(key, json, 'EX', Math.max(1, Math.floor(ttlSeconds)));
        return;
      } catch (err) {
        this.nestLogger.warn(`Redis SET failed (${key}): ${(err as Error).message}`);
        return;
      }
    }
    if (this.memo.size >= this.maxMemoEntries) {
      const firstKey = this.memo.keys().next().value;
      if (firstKey) this.memo.delete(firstKey);
    }
    this.memo.set(key, { value: json, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.nestLogger.warn(`Redis DEL failed (${key}): ${(err as Error).message}`);
      }
      return;
    }
    this.memo.delete(key);
  }

  /**
   * Memoise an async producer with a content-addressable cache. Returns
   * cached value if present; otherwise runs the producer, stores the
   * result, and returns it. Producer errors are NOT cached.
   */
  async memoize<T>(
    prefix: string,
    keyInput: unknown,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const key = this.hashKey(prefix, keyInput);
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await producer();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

/**
 * Deterministic JSON for hashing: keys sorted at every depth. Required so
 * { a: 1, b: 2 } and { b: 2, a: 1 } hash identically.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
