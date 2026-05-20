import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { PhiFreeLogger } from '../../src/common/phi-free-logger';
import type { AppConfig } from '../../src/config/configuration';
import type { Drizzle } from '../../src/db/database.module';

/**
 * Integration-test harness.
 *
 * Connects to the Postgres pointed at by DATABASE_URL, returns a
 * Drizzle client + a ConfigService + a PhiFreeLogger preconfigured
 * for the suite, and gives each test a fresh transaction-free
 * isolation via TRUNCATE … RESTART IDENTITY between tests.
 *
 * Tests SHOULD call resetTables() in beforeEach so they don't leak
 * state to each other. The harness deliberately does not wrap each
 * test in a transaction — services issue multiple statements and
 * some test the audit HMAC chain across rows, which is awkward to
 * roll back atomically.
 */
export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDb = Boolean(DATABASE_URL);

export interface IntegrationHarness {
  db: Drizzle;
  config: ConfigService<AppConfig, true>;
  log: PhiFreeLogger;
  resetTables(): Promise<void>;
  close(): Promise<void>;
}

export function makeIntegrationHarness(
  options: {
    fingerprintSecret?: string;
    hashSecret?: string;
    maxEntries?: number;
    ttlDays?: number;
  } = {},
): IntegrationHarness {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required for the integration harness');

  const pg = postgres(DATABASE_URL, { max: 4 });
  const db = drizzle(pg, { schema });

  const config = {
    get: (key: string) => {
      switch (key) {
        case 'apiKeys.fingerprintSecret':
          return options.fingerprintSecret ?? 'integration-test-fp';
        case 'audit.hashSecret':
          return options.hashSecret ?? 'integration-test-hmac';
        case 'integrationLog.maxEntriesPerIntegrator':
          return options.maxEntries ?? 50_000;
        case 'integrationLog.ttlDays':
          return options.ttlDays ?? 30;
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService<AppConfig, true>;

  const log = new PhiFreeLogger({
    service: 'integration-test',
    hashSecret: options.hashSecret ?? 'integration-test-hmac',
    strict: true,
  });

  return {
    db,
    config,
    log,
    async resetTables() {
      await db.execute(
        sql`TRUNCATE TABLE api_keys, integration_log, audit_events RESTART IDENTITY CASCADE`,
      );
    },
    async close() {
      await pg.end({ timeout: 1 });
    },
  };
}
