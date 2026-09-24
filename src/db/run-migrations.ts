import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * Apply pending Drizzle migrations before the API starts serving.
 *
 * Migrations used to be applied by hand (`npm run db:migrate`), and
 * production silently fell four behind: code that wrote to new columns and
 * tables was deployed against a schema that did not have them. Running them
 * at startup ties the schema to the code that needs it. If a migration fails
 * the process exits before listening, so the platform keeps the previous
 * deployment serving rather than running new code on an old schema.
 *
 * Several instances can start at once, so the run is serialised with a
 * session-level advisory lock on a single dedicated connection (the lock and
 * the migration queries must share one session).
 *
 * On by default only when NODE_ENV=production: a developer's .env can point
 * at a shared database, and starting the API locally must not apply an
 * unmerged migration to it. DB_MIGRATE_ON_START=true|false overrides either
 * way. Always skipped without a DATABASE_URL (dev / unit tests run in-memory).
 */
export const MIGRATION_LOCK_KEY = 726_150_041;

export interface MigrationOptions {
  url: string | undefined;
  ssl: boolean;
  /** DB_MIGRATE_ON_START: "true" / "false" override the NODE_ENV default. */
  flag: string | undefined;
  nodeEnv: string | undefined;
  migrationsFolder?: string;
  log: (message: string) => void;
}

export type MigrationOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'up-to-date'; recorded: number };

export async function runPendingMigrations(opts: MigrationOptions): Promise<MigrationOutcome> {
  if (!opts.url) return { status: 'skipped', reason: 'no DATABASE_URL' };
  const flag = opts.flag?.trim().toLowerCase();
  if (flag === 'false') return { status: 'skipped', reason: 'DB_MIGRATE_ON_START=false' };
  if (flag !== 'true' && opts.nodeEnv !== 'production') {
    return { status: 'skipped', reason: 'not production (set DB_MIGRATE_ON_START=true to run)' };
  }
  const migrationsFolder = opts.migrationsFolder ?? resolve(process.cwd(), 'drizzle');
  if (!existsSync(resolve(migrationsFolder, 'meta', '_journal.json'))) {
    // Refuse to start rather than serve against an unknown schema.
    throw new Error(`Database migrations folder not found at ${migrationsFolder}`);
  }

  const client = postgres(opts.url, {
    max: 1,
    ssl: opts.ssl ? 'require' : false,
    // "already exists, skipping" notices from the bookkeeping table are noise.
    onnotice: () => undefined,
  });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
    try {
      await migrate(drizzle(client), { migrationsFolder });
      const [{ recorded }] = await client<{ recorded: number }[]>`
        select count(*)::int as recorded from drizzle.__drizzle_migrations`;
      opts.log(`Database migrations up to date (${recorded} recorded).`);
      return { status: 'up-to-date', recorded };
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
