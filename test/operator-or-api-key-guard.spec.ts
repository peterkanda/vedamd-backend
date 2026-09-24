import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IdentityService } from '../src/modules/identity/identity.service';
import { ApiKeysService } from '../src/modules/developer/api-keys.service';
import { OperatorOrApiKeyGuard } from '../src/common/operator-auth/operator-or-api-key.guard';
import type { AppConfig } from '../src/config/configuration';

function makeCtx(headers: Record<string, string | undefined>) {
  const req = { headers } as unknown as Record<string, unknown>;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { ctx, req };
}

const config = {
  get: (k: string) => (k === 'identity.devBypass' ? false : undefined),
} as unknown as ConfigService<AppConfig, true>;

function makeGuard(apiKeys: Partial<ApiKeysService>) {
  // Reflector that always requires the audit scope.
  const reflector = {
    getAllAndMerge: () => ['clinical-audit:run'],
  } as unknown as Reflector;
  const identity = {
    verifyAccessToken: async () => null,
    isConfigured: () => false,
  } as unknown as IdentityService;
  return new OperatorOrApiKeyGuard(identity, config, apiKeys as ApiKeysService, reflector);
}

describe('OperatorOrApiKeyGuard — API key path', () => {
  it('accepts a vmd_ key carrying the required scope and synthesises the operator', async () => {
    const guard = makeGuard({
      validateBearer: vi.fn(async () => ({
        id: 'key-1',
        integratorId: 'tenant-A',
        fingerprint: 'fp',
        scopes: ['clinical-audit:run'],
        environment: 'sandbox',
        name: 'audit key',
        createdAt: new Date().toISOString(),
      })) as unknown as ApiKeysService['validateBearer'],
      recordUsage: vi.fn(async () => {}),
    });
    const { ctx, req } = makeCtx({ authorization: 'Bearer vmd_test_abc' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const op = (req as { operator?: { integratorId: string } }).operator;
    expect(op?.integratorId).toBe('tenant-A');
  });

  it('rejects a vmd_ key missing the required scope', async () => {
    const guard = makeGuard({
      validateBearer: vi.fn(async () => ({
        id: 'key-2',
        integratorId: 'tenant-A',
        fingerprint: 'fp',
        scopes: ['cds:evaluate'],
        environment: 'sandbox',
        name: 'wrong key',
        createdAt: new Date().toISOString(),
      })) as unknown as ApiKeysService['validateBearer'],
      recordUsage: vi.fn(async () => {}),
    });
    const { ctx } = makeCtx({ authorization: 'Bearer vmd_test_xyz' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects an invalid vmd_ key', async () => {
    const guard = makeGuard({ validateBearer: vi.fn(async () => null) });
    const { ctx } = makeCtx({ authorization: 'Bearer vmd_test_bad' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('falls through to operator JWT auth for a non-vmd bearer (rejects when unverifiable)', async () => {
    const guard = makeGuard({ validateBearer: vi.fn(async () => null) });
    const { ctx } = makeCtx({ authorization: 'Bearer some.jwt.token' });
    // identity.verifyAccessToken returns null + non-prod decode of a fake
    // token yields null → Unauthorized.
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
