import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiKeysService } from '../../src/modules/developer/api-keys.service';
import { hasDb, makeIntegrationHarness, type IntegrationHarness } from './harness';

const d = hasDb ? describe : describe.skip;

d('ApiKeysService — Postgres integration', () => {
  let h: IntegrationHarness;
  let svc: ApiKeysService;

  beforeAll(() => {
    h = makeIntegrationHarness();
    svc = new ApiKeysService(h.config, h.db);
  });

  beforeEach(async () => {
    await h.resetTables();
  });

  afterAll(async () => {
    await h.close();
  });

  it('create → list returns the row, with fingerprint and not the secret', async () => {
    const created = await svc.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    expect(created.secret).toMatch(/^vmd_test_/);
    expect(created.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const listed = await svc.list('penda');
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    expect((listed[0] as unknown as { secret?: string }).secret).toBeUndefined();
  });

  it('validateBearer round-trip: returns the key for a real secret, null for noise', async () => {
    const created = await svc.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    expect(await svc.validateBearer(created.secret)).not.toBeNull();
    expect(await svc.validateBearer('vmd_test_garbage')).toBeNull();
    expect(await svc.validateBearer(undefined)).toBeNull();
  });

  it('revoke marks the row revoked and validateBearer subsequently fails', async () => {
    const created = await svc.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    const revoked = await svc.revoke('penda', created.id);
    expect(revoked?.revokedAt).toBeDefined();
    expect(await svc.validateBearer(created.secret)).toBeNull();
  });

  it('scopes the list and revoke to the calling integratorId', async () => {
    const a = await svc.create({
      integratorId: 'penda',
      name: 'a',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    await svc.create({
      integratorId: 'mydawa',
      name: 'b',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });

    expect(await svc.list('penda')).toHaveLength(1);
    expect(await svc.list('mydawa')).toHaveLength(1);

    // mydawa cannot revoke penda's key
    expect(await svc.revoke('mydawa', a.id)).toBeNull();
    expect((await svc.list('penda'))[0].revokedAt).toBeUndefined();
  });

  it('recordUsage updates lastUsedAt', async () => {
    const created = await svc.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    const when = new Date('2026-05-01T12:00:00Z');
    await svc.recordUsage(created.id, when);
    const [row] = await svc.list('penda');
    expect(row.lastUsedAt).toBe(when.toISOString());
  });
});
