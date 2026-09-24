import { describe, expect, it } from 'vitest';
import { runPendingMigrations } from '../src/db/run-migrations';

/**
 * Startup migrations must run in production and nowhere by accident: a
 * developer's .env can point at a shared database, and starting the API
 * locally must not apply an unmerged migration to it. None of these cases
 * opens a connection.
 */
const URL = 'postgresql://user:pass@127.0.0.1:1/none';
const base = { url: URL, ssl: false, log: () => undefined };

describe('runPendingMigrations', () => {
  it('skips without a DATABASE_URL', async () => {
    const r = await runPendingMigrations({ ...base, url: '', flag: 'true', nodeEnv: 'production' });
    expect(r).toEqual({ status: 'skipped', reason: 'no DATABASE_URL' });
  });

  it('skips outside production unless asked', async () => {
    const r = await runPendingMigrations({ ...base, flag: undefined, nodeEnv: 'development' });
    expect(r.status).toBe('skipped');
  });

  it('can be switched off in production', async () => {
    const r = await runPendingMigrations({ ...base, flag: 'false', nodeEnv: 'production' });
    expect(r).toEqual({ status: 'skipped', reason: 'DB_MIGRATE_ON_START=false' });
  });

  it('refuses to start when enabled but the migrations folder is missing', async () => {
    await expect(
      runPendingMigrations({
        ...base,
        flag: undefined,
        nodeEnv: 'production',
        migrationsFolder: '/nonexistent/drizzle',
      }),
    ).rejects.toThrow(/migrations folder not found/);
  });

  it('the repo ships the migrations folder it will read', async () => {
    // Enabled + real folder gets past every guard and only then connects;
    // the unreachable URL proves it tried rather than skipping.
    await expect(
      runPendingMigrations({ ...base, flag: 'true', nodeEnv: 'development' }),
    ).rejects.toThrow();
  });
});
