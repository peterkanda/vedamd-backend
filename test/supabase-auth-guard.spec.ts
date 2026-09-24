import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import {
  SupabaseAuthGuard,
  clearVerifiedSessions,
} from '../src/common/supabase-auth/supabase-auth.guard';

function jwt(expSeconds: number): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp: expSeconds })}.sig`;
}

function ctx(token: string): { context: ExecutionContext; req: { supabaseUser?: unknown } } {
  const req = { headers: { authorization: `Bearer ${token}` } } as {
    headers: Record<string, string>;
    supabaseUser?: unknown;
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

describe('SupabaseAuthGuard — verified-session cache', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    clearVerifiedSessions();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const ok = () =>
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' })),
    );

  it('asks Supabase once for repeated requests with the same token', async () => {
    ok();
    const guard = new SupabaseAuthGuard();
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    for (let i = 0; i < 3; i++) {
      const { context, req } = ctx(token);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(req.supabaseUser).toEqual({ id: 'u1', email: 'a@b.c' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cache window has passed', async () => {
    ok();
    vi.useFakeTimers();
    const guard = new SupabaseAuthGuard();
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    await guard.canActivate(ctx(token).context);
    vi.advanceTimersByTime(61_000);
    await guard.canActivate(ctx(token).context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never trusts a token past its own expiry', async () => {
    ok();
    vi.useFakeTimers();
    const guard = new SupabaseAuthGuard();
    const token = jwt(Math.floor(Date.now() / 1000) + 5);
    await guard.canActivate(ctx(token).context);
    vi.advanceTimersByTime(6_000);
    await guard.canActivate(ctx(token).context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not remember a rejected token', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    const guard = new SupabaseAuthGuard();
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    await expect(guard.canActivate(ctx(token).context)).rejects.toThrow();
    await expect(guard.canActivate(ctx(token).context)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
