import { describe, expect, it, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../src/modules/developer/api-keys.service';
import type { AppConfig } from '../src/config/configuration';

function makeConfig(): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'apiKeys.fingerprintSecret') return 'test-fingerprint-secret';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe('ApiKeysService — rotation (in-memory)', () => {
  let svc: ApiKeysService;

  beforeEach(() => {
    svc = new ApiKeysService(makeConfig(), null);
  });

  it('rotates a key — old fingerprint revoked, new secret minted with same name+scopes+env', async () => {
    const created = await svc.create({
      integratorId: 'acme',
      name: 'EMR-1',
      scopes: ['cds:evaluate', 'content:read'],
      environment: 'production',
    });
    expect(created.secret).toMatch(/^vmd_live_/);
    const oldSecret = created.secret;
    const oldId = created.id;

    const result = await svc.rotate('acme', oldId);
    expect(result).not.toBeNull();
    expect(result!.revoked.id).toBe(oldId);
    expect(result!.revoked.revokedAt).toBeTruthy();
    expect(result!.created.id).not.toBe(oldId);
    expect(result!.created.name).toBe('EMR-1');
    expect(result!.created.scopes).toEqual(['cds:evaluate', 'content:read']);
    expect(result!.created.environment).toBe('production');
    expect(result!.created.secret).toMatch(/^vmd_live_/);
    expect(result!.created.secret).not.toBe(oldSecret);

    // Old secret no longer validates.
    expect(await svc.validateBearer(oldSecret)).toBeNull();
    // New secret validates.
    const matched = await svc.validateBearer(result!.created.secret);
    expect(matched?.id).toBe(result!.created.id);
  });

  it('refuses to rotate a key owned by a different integrator', async () => {
    const created = await svc.create({
      integratorId: 'acme',
      name: 'EMR-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    expect(await svc.rotate('other-tenant', created.id)).toBeNull();
  });

  it('refuses to rotate an already-revoked key', async () => {
    const created = await svc.create({
      integratorId: 'acme',
      name: 'EMR-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    await svc.revoke('acme', created.id);
    expect(await svc.rotate('acme', created.id)).toBeNull();
  });

  it('returns null for unknown id', async () => {
    expect(await svc.rotate('acme', 'doesnotexist')).toBeNull();
  });
});
