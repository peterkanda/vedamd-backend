import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DataSourcesService } from '../src/modules/data-sources/data-sources.service';
import type { SqlIngestionService } from '../src/modules/agentic/connectors/sql-ingestion.service';

function makeService() {
  process.env.SECRETS_VAULT_MASTER_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const registerConnection = vi.fn();
  const registerQuery = vi.fn();
  const fetchRows = vi.fn(async () => ({ rows: [{ ok: 1 }], mapping: {} }));
  const sql = { registerConnection, registerQuery, fetchRows } as unknown as SqlIngestionService;
  const svc = new DataSourcesService(null, sql);
  // Fire onModuleInit (hydration is a noop without DB).
  void svc.onModuleInit();
  return { svc, registerConnection, registerQuery, fetchRows };
}

describe('DataSourcesService — connections', () => {
  let svc: DataSourcesService;
  let registerConnection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ svc, registerConnection } = makeService());
  });

  it('creates a connection, encrypts the URL, and pushes into the ingestion registry', async () => {
    const created = await svc.createConnection('tenant-A', {
      id: 'prod-postgres',
      name: 'Production',
      dialect: 'postgres',
      url: 'postgresql://user:pw@db.example.com/app',
    });

    expect(created.id).toBe('prod-postgres');
    expect(created.dialect).toBe('postgres');
    // The API summary must not carry the URL.
    expect((created as unknown as Record<string, unknown>).url).toBeUndefined();
    expect((created as unknown as Record<string, unknown>).encryptedUrl).toBeUndefined();
    // The ingestion registry was hydrated with the decrypted URL.
    expect(registerConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prod-postgres',
        dialect: 'postgres',
        url: 'postgresql://user:pw@db.example.com/app',
      }),
    );
  });

  it('rejects an invalid kebab-case id', async () => {
    await expect(
      svc.createConnection('tenant-A', {
        id: 'Bad Id With Spaces',
        name: 'Bad',
        dialect: 'postgres',
        url: 'postgresql://x',
      }),
    ).rejects.toThrow(/kebab-case/);
  });

  it('rejects an unknown dialect', async () => {
    await expect(
      svc.createConnection('tenant-A', {
        id: 'bad',
        name: 'Bad',
        dialect: 'sqlite' as unknown as 'postgres',
        url: 'sqlite://x',
      }),
    ).rejects.toThrow(/dialect/);
  });

  it('isolates connections by integratorId', async () => {
    await svc.createConnection('tenant-A', {
      id: 'a-conn',
      name: 'A',
      dialect: 'postgres',
      url: 'postgresql://x',
    });
    expect((await svc.listConnections('tenant-B')).length).toBe(0);
    expect((await svc.listConnections('tenant-A')).length).toBe(1);
  });

  it('rotates the encrypted URL on update', async () => {
    await svc.createConnection('tenant-A', {
      id: 'rot',
      name: 'Rot',
      dialect: 'postgres',
      url: 'postgresql://old',
    });
    registerConnection.mockClear();
    await svc.updateConnection('tenant-A', 'rot', { url: 'postgresql://new' });
    expect(registerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rot', url: 'postgresql://new' }),
    );
  });

  it('test-connect uses the ingestion service and reports latency', async () => {
    await svc.createConnection('tenant-A', {
      id: 'probe-target',
      name: 'P',
      dialect: 'postgres',
      url: 'postgresql://x',
    });
    const result = await svc.testConnection('tenant-A', 'probe-target');
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });
});

describe('DataSourcesService — named queries', () => {
  let svc: DataSourcesService;
  let registerQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ svc, registerQuery } = makeService());
  });

  it('creates a named query, enforces read-only SELECT, and pushes into the registry', async () => {
    const created = await svc.createQuery('tenant-A', {
      id: 'polypharmacy',
      name: 'Polypharmacy',
      sql: 'SELECT patient_id, med_name FROM meds WHERE 1=1',
      mapping: { medicationColumn: 'med_name' },
    });
    expect(created.id).toBe('polypharmacy');
    expect(registerQuery).toHaveBeenCalledWith(expect.objectContaining({ id: 'polypharmacy' }));
  });

  it('rejects a non-SELECT query', async () => {
    await expect(
      svc.createQuery('tenant-A', {
        id: 'bad',
        name: 'Bad',
        sql: 'DELETE FROM users',
        mapping: {},
      }),
    ).rejects.toThrow(/read-only/);
  });

  it('rejects stacked statements', async () => {
    await expect(
      svc.createQuery('tenant-A', {
        id: 'stack',
        name: 'Stack',
        sql: 'SELECT 1; DROP TABLE users',
        mapping: {},
      }),
    ).rejects.toThrow();
  });

  it('isolates queries by integratorId', async () => {
    await svc.createQuery('tenant-A', {
      id: 'a-q',
      name: 'A',
      sql: 'SELECT 1',
      mapping: {},
    });
    expect((await svc.listQueries('tenant-B')).length).toBe(0);
    expect((await svc.listQueries('tenant-A')).length).toBe(1);
  });
});
