import { describe, expect, it, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../src/modules/developer/api-keys.service';
import { ApiKeyGuard } from '../src/common/api-key-auth/api-key.guard';
import { REQUIRED_SCOPES_KEY } from '../src/common/api-key-auth/require-scope.decorator';
import type { AppConfig } from '../src/config/configuration';

function makeConfig(): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'apiKeys.fingerprintSecret') return 'test-fingerprint-secret';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

function makeContext(headers: Record<string, string>, requiredScopes: string[] = []) {
  const req = { headers } as unknown as Record<string, unknown>;
  const reflector = new Reflector();
  // Stand in for handler/class metadata by stuffing requiredScopes into the
  // metadata store the Reflector will read.
  const handler = function dummy() {};
  const klass = class Dummy {};
  Reflect.defineMetadata(REQUIRED_SCOPES_KEY, requiredScopes, handler);
  Reflect.defineMetadata(REQUIRED_SCOPES_KEY, [], klass);

  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;

  return { ctx, req, reflector };
}

describe('ApiKeyGuard', () => {
  let service: ApiKeysService;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    service = new ApiKeysService(makeConfig());
    guard = new ApiKeyGuard(service, new Reflector());
  });

  it('rejects a request with no Authorization header', () => {
    const { ctx } = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a malformed bearer token', () => {
    const { ctx } = makeContext({ authorization: 'Bearer not-a-vmd-key' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('accepts a valid bearer token and attaches the authenticated key', () => {
    const created = service.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });

    const { ctx, req } = makeContext({ authorization: `Bearer ${created.secret}` });
    expect(guard.canActivate(ctx)).toBe(true);
    const authed = (req as { apiKey?: { integratorId: string; keyId: string } }).apiKey;
    expect(authed?.integratorId).toBe('penda');
    expect(authed?.keyId).toBe(created.id);
  });

  it('rejects a revoked bearer token', () => {
    const created = service.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });
    service.revoke('penda', created.id);

    const { ctx } = makeContext({ authorization: `Bearer ${created.secret}` });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects when the API key lacks the required scope', () => {
    const created = service.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:discover'],
      environment: 'sandbox',
    });

    const { ctx } = makeContext(
      { authorization: `Bearer ${created.secret}` },
      ['cds:evaluate'],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('records last-used on successful authentication', () => {
    const created = service.create({
      integratorId: 'penda',
      name: 'sandbox-1',
      scopes: ['cds:evaluate'],
      environment: 'sandbox',
    });

    const { ctx } = makeContext({ authorization: `Bearer ${created.secret}` });
    guard.canActivate(ctx);

    const listed = service.list('penda');
    expect(listed[0]?.lastUsedAt).toBeDefined();
  });
});
