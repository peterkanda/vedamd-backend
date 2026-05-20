import { describe, expect, it, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JWTPayload } from 'jose';
import { IdentityService } from '../src/modules/identity/identity.service';
import { OperatorAuthGuard } from '../src/common/operator-auth/operator-auth.guard';
import type { AppConfig } from '../src/config/configuration';

interface ConfigOverrides {
  integratorIdClaim?: string;
  devBypass?: boolean;
}

function makeConfig(overrides: ConfigOverrides = {}): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'identity.integratorIdClaim')
        return overrides.integratorIdClaim ?? 'integrator_id';
      if (key === 'identity.devBypass') return overrides.devBypass ?? false;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

function makeIdentity(verifyResult: JWTPayload | null): IdentityService {
  return {
    verifyAccessToken: async () => verifyResult,
  } as unknown as IdentityService;
}

function makeContext(headers: Record<string, string | undefined>) {
  const req = { headers } as unknown as Record<string, unknown>;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('OperatorAuthGuard — production / OIDC path', () => {
  let guard: OperatorAuthGuard;

  it('rejects a request with no Authorization header (no dev bypass)', async () => {
    guard = new OperatorAuthGuard(makeIdentity(null), makeConfig({ devBypass: false }));
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid JWT', async () => {
    guard = new OperatorAuthGuard(makeIdentity(null), makeConfig({ devBypass: false }));
    const { ctx } = makeContext({ authorization: 'Bearer not-a-real-token' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Invalid or expired/);
  });

  it('rejects a JWT without the integrator_id claim', async () => {
    const claims: JWTPayload = { sub: 'op-1' };
    guard = new OperatorAuthGuard(makeIdentity(claims), makeConfig({ devBypass: false }));
    const { ctx } = makeContext({ authorization: 'Bearer t' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/integrator_id/);
  });

  it('accepts a valid JWT and attaches the operator', async () => {
    const claims: JWTPayload = { sub: 'op-1', integrator_id: 'penda' };
    guard = new OperatorAuthGuard(makeIdentity(claims), makeConfig({ devBypass: false }));
    const { ctx, req } = makeContext({ authorization: 'Bearer t' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const op = (req as { operator?: { sub: string; integratorId: string; viaDevBypass: boolean } })
      .operator;
    expect(op?.sub).toBe('op-1');
    expect(op?.integratorId).toBe('penda');
    expect(op?.viaDevBypass).toBe(false);
  });

  it('honours the configured integrator_id claim name', async () => {
    const claims: JWTPayload = { sub: 'op-1', org_id: 'penda' };
    guard = new OperatorAuthGuard(
      makeIdentity(claims),
      makeConfig({ devBypass: false, integratorIdClaim: 'org_id' }),
    );
    const { ctx, req } = makeContext({ authorization: 'Bearer t' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const op = (req as { operator?: { integratorId: string } }).operator;
    expect(op?.integratorId).toBe('penda');
  });
});

describe('OperatorAuthGuard — dev bypass', () => {
  let guard: OperatorAuthGuard;

  beforeEach(() => {
    guard = new OperatorAuthGuard(makeIdentity(null), makeConfig({ devBypass: true }));
  });

  it('accepts x-integrator-id when dev bypass is on', async () => {
    const { ctx, req } = makeContext({ 'x-integrator-id': 'penda' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const op = (req as { operator?: { integratorId: string; viaDevBypass: boolean } }).operator;
    expect(op?.integratorId).toBe('penda');
    expect(op?.viaDevBypass).toBe(true);
  });

  it('still rejects when neither bearer nor x-integrator-id is present', async () => {
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('prefers the bearer token over x-integrator-id when both are present', async () => {
    const claims: JWTPayload = { sub: 'op-1', integrator_id: 'from-jwt' };
    guard = new OperatorAuthGuard(makeIdentity(claims), makeConfig({ devBypass: true }));
    const { ctx, req } = makeContext({
      authorization: 'Bearer t',
      'x-integrator-id': 'from-header',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const op = (req as { operator?: { integratorId: string; viaDevBypass: boolean } }).operator;
    expect(op?.integratorId).toBe('from-jwt');
    expect(op?.viaDevBypass).toBe(false);
  });
});
