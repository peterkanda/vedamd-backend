import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration';
import { CacheService } from './cache.service';

/**
 * Optional Redis token. Injected as `Redis | null`:
 *   - REDIS_URL set + ioredis installed → ioredis client connected with
 *     retry/backoff.
 *   - REDIS_URL absent OR ioredis missing → null, CacheService falls back
 *     to a per-process in-memory LRU. Stateless behaviour is preserved
 *     either way; the cache only carries derived, recomputable values
 *     (deterministic CDS results, bundle metadata) — never PHI.
 *
 * ioredis is loaded via dynamic require so the project compiles + boots
 * even if the optional dependency is not installed (e.g. before
 * `npm install`, in slim Docker images, or for unit tests).
 */
export const REDIS = Symbol('REDIS');
export type MaybeRedis = Redis | null;

const redisProvider: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): MaybeRedis => {
    const url = config.get('redis.url', { infer: true });
    if (!url) return null;

    const logger = new Logger('Redis');

    type IORedisCtor = new (url: string, opts: Record<string, unknown>) => Redis;
    let IORedis: IORedisCtor;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require('ioredis');
      IORedis = (mod.default ?? mod) as IORedisCtor;
    } catch {
      logger.warn(
        'REDIS_URL set but ioredis is not installed — falling back to in-memory cache.',
      );
      return null;
    }

    const client = new IORedis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    });

    client.on('error', (err: Error) => {
      logger.warn(`Redis error: ${err.message}`);
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
