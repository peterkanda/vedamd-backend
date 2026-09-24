import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../src/modules/developer/api-keys.service';
import type { AppConfig } from '../src/config/configuration';
import type { MaybeDrizzle } from '../src/db/database.module';

function makeConfig(): ConfigService<AppConfig, true> {
  return {
    get: (key: string) =>
      key === 'apiKeys.fingerprintSecret' ? 'test-fingerprint-secret' : undefined,
  } as unknown as ConfigService<AppConfig, true>;
}

/**
 * Just enough of the Drizzle query builder for ApiKeysService: one
 * `api_keys` table held in an array, and a count of SELECTs and UPDATEs.
 * Filters are ignored — the table holds a single key.
 */
function fakeDb() {
  const rows: Array<Record<string, unknown>> = [];
  const calls = { select: 0, update: 0 };
  const db = {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        rows.push({ lastUsedAt: null, revokedAt: null, ...v });
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.select++;
            return rows.filter((r) => !r.revokedAt);
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          calls.update++;
          for (const r of rows) Object.assign(r, patch);
          const done = Promise.resolve(rows);
          return Object.assign(done, { returning: async () => rows });
        },
      }),
    }),
  };
  return { db: db as unknown as MaybeDrizzle, calls };
}

describe('ApiKeysService — database lookups are cached', () => {
  let svc: ApiKeysService;
  let calls: { select: number; update: number };

  beforeEach(() => {
    const fake = fakeDb();
    calls = fake.calls;
    svc = new ApiKeysService(makeConfig(), fake.db);
  });
  afterEach(() => vi.useRealTimers());

  const mint = () =>
    svc.create({
      integratorId: 'acme',
      name: 'EMR',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });

  it('validates a key from the database once, then from memory', async () => {
    const { secret, id } = await mint();
    for (let i = 0; i < 5; i++) expect((await svc.validateBearer(secret))?.id).toBe(id);
    expect(calls.select).toBe(1);
  });

  it('asks the database again after the cache window', async () => {
    vi.useFakeTimers();
    const { secret } = await mint();
    await svc.validateBearer(secret);
    vi.advanceTimersByTime(61_000);
    await svc.validateBearer(secret);
    expect(calls.select).toBe(2);
  });

  it('stops accepting a key the moment it is revoked', async () => {
    const { secret, id } = await mint();
    expect(await svc.validateBearer(secret)).not.toBeNull();
    await svc.revoke('acme', id);
    expect(await svc.validateBearer(secret)).toBeNull();
  });

  it('remembers an unknown key only briefly', async () => {
    vi.useFakeTimers();
    await svc.validateBearer('vmd_test_unknown');
    await svc.validateBearer('vmd_test_unknown');
    expect(calls.select).toBe(1);
    vi.advanceTimersByTime(11_000);
    await svc.validateBearer('vmd_test_unknown');
    expect(calls.select).toBe(2);
  });

  it('writes last_used_at at most once a minute per key', async () => {
    const { id } = await mint();
    const t0 = new Date('2026-09-24T12:00:00Z');
    await svc.recordUsage(id, t0);
    await svc.recordUsage(id, new Date(t0.getTime() + 30_000));
    expect(calls.update).toBe(1);
    await svc.recordUsage(id, new Date(t0.getTime() + 61_000));
    expect(calls.update).toBe(2);
  });
});
