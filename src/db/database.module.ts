import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import type { AppConfig } from '../config/configuration';

/**
 * Drizzle client token. Injected as `Drizzle | null` — null when no
 * DATABASE_URL is configured (dev / unit-test mode). Services check
 * for null and fall back to in-memory state.
 */
export const DRIZZLE = Symbol('DRIZZLE');

export type Drizzle = PostgresJsDatabase<typeof schema>;
export type MaybeDrizzle = Drizzle | null;

const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): MaybeDrizzle => {
    const url = config.get('database.url', { infer: true });
    if (!url) return null;
    const client = postgres(url, {
      max: config.get('database.poolMax', { infer: true }),
      ssl: config.get('database.ssl', { infer: true }) ? 'require' : false,
    });
    return drizzle(client, { schema });
  },
};

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
