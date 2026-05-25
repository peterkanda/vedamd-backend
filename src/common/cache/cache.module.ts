import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { type Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration';
import { CacheService } from './cache.service';

/**
 * Optional Redis token. Injected as `Redis | null`:
 *   - REDIS_URL set      → ioredis client connected with retry/backoff.
 *   - REDIS_URL absent   → null, CacheService falls back to a per-process
 *                          in-memory LRU. Stateless behaviour is preserved
 *                          either way; the cache only carries derived,
 *                          recomputable values (deterministic CDS results,
 *                          bundle metadata) — never PHI.
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
    const client = new IORedis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    client.on('error', (err) => {
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
