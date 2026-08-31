import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { CacheService } from './cache.service';

/**
 * Minimal structural Redis client interface used by CacheService.
 *
 * Defined locally so the cache module compiles + boots even when the
 * optional `ioredis` package is NOT installed (slim Docker images,
 * pre-`npm install` state, unit tests). When ioredis IS installed, its
 * real client object satisfies this interface structurally.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Optional Redis token. Injected as `RedisClientLike | null`:
 *   - REDIS_URL set + ioredis installed → ioredis client connected with
 *     retry/backoff.
 *   - REDIS_URL absent OR ioredis missing → null, CacheService falls back
 *     to a per-process in-memory LRU. Stateless behaviour is preserved
 *     either way; the cache only carries derived, recomputable values
 *     (deterministic CDS results, bundle metadata) — never PHI.
 *
 * ioredis is loaded via dynamic `require` (no top-level import) so the
 * project compiles + boots even if the optional dependency is missing.
 */
export const REDIS = Symbol('REDIS');
export type MaybeRedis = RedisClientLike | null;

type IORedisCtor = new (url: string, opts: Record<string, unknown>) => RedisClientLike;

const redisProvider: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): MaybeRedis => {
    const url = config.get('redis.url', { infer: true });
    if (!url) return null;

    const logger = new Logger('Redis');

    let IORedis: IORedisCtor;
    try {
      const mod = require('ioredis');
      IORedis = (mod.default ?? mod) as IORedisCtor;
    } catch {
      logger.warn('REDIS_URL set but ioredis is not installed — falling back to in-memory cache.');
      return null;
    }

    const client = new IORedis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    });

    client.on('error', (...args: unknown[]) => {
      const err = args[0] as Error | undefined;
      logger.warn(`Redis error: ${err?.message ?? 'unknown'}`);
    });
    client.on('ready', () => {
      logger.log('Redis connection ready');
    });

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider, CacheService],
  exports: [REDIS, CacheService],
})
export class CacheModule {}
