import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
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

/**
 * Run `cb` inside a transaction that has the `app.integrator_id` GUC set
 * to `integratorId` for its lifetime (`SET LOCAL` semantics via
 * set_config(..., true)). The row-level-security policies introduced in
 * migration 0006 read this GUC: inside this scope the database itself
 * enforces tenant isolation, so even a missing/incorrect application
 * WHERE clause cannot leak another tenant's rows.
 *
 * Tenant-scoped services should route their queries through this helper
 * (passing the provided `tx`) instead of querying the shared client
 * directly. Until a path adopts it, the null-safe policy falls back to
 * application-layer filtering, so adoption can be incremental and safe.
 */
export async function withTenant<T>(
  db: Drizzle,
  integratorId: string,
  cb: (tx: Drizzle) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(key, value, is_local=true) === SET LOCAL — scoped to
    // this transaction and reset automatically when it ends, so a pooled
    // connection never leaks tenant context to the next checkout.
    await tx.execute(sql`select set_config('app.integrator_id', ${integratorId}, true)`);
    return cb(tx as unknown as Drizzle);
  });
}

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
