import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of, isEmpty } from 'rxjs';
import { ContentCacheInterceptor } from '../src/common/http-cache/content-cache.interceptor';
import { IMMUTABLE_CONTENT } from '../src/common/http-cache/immutable-content.decorator';

function makeCtx(opts: {
  metadata?: { maxAgeSeconds: number };
  method?: string;
  url?: string;
  ifNoneMatch?: string;
  reply: { header: ReturnType<typeof vi.fn>; code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (key === IMMUTABLE_CONTENT ? opts.metadata : undefined)),
  } as never;
  const knowledge = { getInfo: () => ({ version: '0.1.0' }) } as never;
  const req = {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/v1/drugs',
    headers: opts.ifNoneMatch ? { 'if-none-match': opts.ifNoneMatch } : {},
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => opts.reply,
    }),
  } as never;
  return { reflector, knowledge, context };
}

function makeReply() {
  return { header: vi.fn(), code: vi.fn(), send: vi.fn() };
}

describe('ContentCacheInterceptor', () => {
  it('is a no-op when the route is not marked @ImmutableContent', async () => {
    const reply = makeReply();
    const { reflector, knowledge, context } = makeCtx({ metadata: undefined, reply });
    const interceptor = new ContentCacheInterceptor(reflector, knowledge);
    const next = { handle: () => of({ drugs: [] }) };
    const result = await lastValueFrom(interceptor.intercept(context, next));
    expect(result).toEqual({ drugs: [] });
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('sets a version-derived ETag + immutable Cache-Control on a fresh GET', async () => {
    const reply = makeReply();
    const { reflector, knowledge, context } = makeCtx({
      metadata: { maxAgeSeconds: 3600 },
      reply,
    });
    const interceptor = new ContentCacheInterceptor(reflector, knowledge);
    const next = { handle: () => of({ drugs: [1, 2, 3] }) };
    const result = await lastValueFrom(interceptor.intercept(context, next));
    expect(result).toEqual({ drugs: [1, 2, 3] });
    const headerCalls = Object.fromEntries(reply.header.mock.calls);
    expect(headerCalls['cache-control']).toBe('public, max-age=3600, immutable');
    expect(headerCalls['etag']).toMatch(/^"0\.1\.0\.[0-9a-f]{16}"$/);
    expect(reply.code).not.toHaveBeenCalledWith(304);
  });

  it('returns 304 (and skips the handler) when If-None-Match matches', async () => {
    // First compute the ETag the interceptor would emit for this URL.
    const probe = makeReply();
    const c1 = makeCtx({ metadata: { maxAgeSeconds: 3600 }, url: '/api/v1/conditions', reply: probe });
    const i1 = new ContentCacheInterceptor(c1.reflector, c1.knowledge);
    await lastValueFrom(i1.intercept(c1.context, { handle: () => of({}) }));
    const etag = Object.fromEntries(probe.header.mock.calls)['etag'] as string;

    // Now replay with If-None-Match set to that ETag.
    const reply = makeReply();
    const { reflector, knowledge, context } = makeCtx({
      metadata: { maxAgeSeconds: 3600 },
      url: '/api/v1/conditions',
      ifNoneMatch: etag,
      reply,
    });
    const interceptor = new ContentCacheInterceptor(reflector, knowledge);
    const handle = vi.fn(() => of({ huge: 'payload' }));
    const obs = interceptor.intercept(context, { handle });
    // The handler must NOT run (no serialization on a cache hit).
    expect(handle).not.toHaveBeenCalled();
    expect(reply.code).toHaveBeenCalledWith(304);
    expect(reply.send).toHaveBeenCalled();
    // Stream completes empty.
    expect(await lastValueFrom(obs.pipe(isEmpty()))).toBe(true);
  });

  it('does not cache non-GET requests even when marked', async () => {
    const reply = makeReply();
    const { reflector, knowledge, context } = makeCtx({
      metadata: { maxAgeSeconds: 3600 },
      method: 'POST',
      reply,
    });
    const interceptor = new ContentCacheInterceptor(reflector, knowledge);
    const result = await lastValueFrom(interceptor.intercept(context, { handle: () => of({ ok: true }) }));
    expect(result).toEqual({ ok: true });
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('treats a wildcard If-None-Match (*) as a hit', async () => {
    const reply = makeReply();
    const { reflector, knowledge, context } = makeCtx({
      metadata: { maxAgeSeconds: 3600 },
      ifNoneMatch: '*',
      reply,
    });
    const interceptor = new ContentCacheInterceptor(reflector, knowledge);
    const handle = vi.fn(() => of({}));
    interceptor.intercept(context, { handle });
    expect(reply.code).toHaveBeenCalledWith(304);
    expect(handle).not.toHaveBeenCalled();
  });
});
