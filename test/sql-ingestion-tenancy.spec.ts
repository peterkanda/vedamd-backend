import { beforeAll, describe, expect, it } from 'vitest';
import { SqlIngestionService } from '../src/modules/agentic/connectors/sql-ingestion.service';

// These tests exercise ownership, not connectivity; allow loopback so the
// DNS-aware SSRF check (which runs after the ownership gate) doesn't reach
// the network on the allow-path cases.
beforeAll(() => {
  process.env.SSRF_BLOCK_PRIVATE = 'false';
});
import type { SqlConnector } from '../src/modules/agentic/connectors/sql-connector.types';
import type { PhiFreeLogger } from '../src/common/phi-free-logger';

/**
 * C3 regression: a tenant must never reach another tenant's registered
 * connection/query. Ownership is enforced before any driver runs, and an
 * owned entry looks identical to a non-existent one to a non-owner (no id
 * enumeration).
 */
function makeService(): SqlIngestionService {
  const connector = {
    isAvailable: () => true,
    query: async () => [{ age: 40 }],
  } as unknown as SqlConnector;
  const log = { info: () => undefined } as unknown as PhiFreeLogger;
  // The constructor wires connectors by dialect; pass the same stub for all.
  return new SqlIngestionService(
    connector as never,
    connector as never,
    connector as never,
    connector as never,
    log,
  );
}

describe('SqlIngestionService per-tenant ownership', () => {
  it('refuses another tenant’s connection as if it did not exist', async () => {
    const svc = makeService();
    svc.registerConnection({ id: 'emr', dialect: 'postgres', url: 'postgres://127.0.0.1/a', integratorId: 'tenant-A' });
    svc.registerQuery({ id: 'q1', sql: 'SELECT 1', mapping: {}, integratorId: 'tenant-A' });

    await expect(
      svc.buildContext('emr', 'q1', {}, undefined, undefined, 'tenant-B'),
    ).rejects.toThrow(/Unknown connectionId/);
  });

  it('allows the owning tenant', async () => {
    const svc = makeService();
    svc.registerConnection({ id: 'emr', dialect: 'postgres', url: 'postgres://127.0.0.1/a', integratorId: 'tenant-A' });
    svc.registerQuery({ id: 'q1', sql: 'SELECT 1', mapping: { patient: { ageYears: 'age' } }, integratorId: 'tenant-A' });

    const ctx = await svc.buildContext('emr', 'q1', {}, 'patient-view', undefined, 'tenant-A');
    expect(ctx.patient?.ageYears).toBe(40);
  });

  it('shares unowned (env-config) connections with any caller', async () => {
    const svc = makeService();
    svc.registerConnection({ id: 'shared', dialect: 'postgres', url: 'postgres://127.0.0.1/a' });
    svc.registerQuery({ id: 'q', sql: 'SELECT 1', mapping: {} });
    // No integratorId on the entry → any requester may use it.
    await expect(svc.buildContext('shared', 'q', {}, undefined, undefined, 'anyone')).resolves.toBeDefined();
  });

  it('getRegisteredConnection hides another tenant’s entry', () => {
    const svc = makeService();
    svc.registerConnection({ id: 'emr', dialect: 'postgres', url: 'postgres://127.0.0.1/a', integratorId: 'tenant-A' });
    expect(svc.getRegisteredConnection('emr', 'tenant-B')).toBeNull();
    expect(svc.getRegisteredConnection('emr', 'tenant-A')).not.toBeNull();
  });
});
