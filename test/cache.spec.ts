import { describe, expect, it, vi } from 'vitest';
import { CacheService } from '../src/common/cache/cache.service';

describe('CacheService (in-memory fallback)', () => {
  it('stores and retrieves values within TTL', async () => {
    const svc = new CacheService(null);
    expect(svc.enabled()).toBe(false);
    await svc.set('k1', { v: 1 }, 60);
    expect(await svc.get<{ v: number }>('k1')).toEqual({ v: 1 });
  });

  it('expires entries past TTL', async () => {
    vi.useFakeTimers();
    try {
      const svc = new CacheService(null);
      await svc.set('k2', 'value', 1);
      vi.advanceTimersByTime(2_000);
      expect(await svc.get('k2')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deletes a key', async () => {
    const svc = new CacheService(null);
    await svc.set('k3', 'v', 60);
    await svc.del('k3');
    expect(await svc.get('k3')).toBeNull();
  });

  it('produces stable hash keys regardless of property order', () => {
    const svc = new CacheService(null);
    const a = svc.hashKey('cds', { medications: ['a', 'b'], age: 42 });
    const b = svc.hashKey('cds', { age: 42, medications: ['a', 'b'] });
    expect(a).toBe(b);
  });

  it('memoise runs the producer once and caches the value', async () => {
    const svc = new CacheService(null);
    const producer = vi.fn().mockResolvedValue({ count: 1 });
    const v1 = await svc.memoize('test', { x: 1 }, 60, producer);
    const v2 = await svc.memoize('test', { x: 1 }, 60, producer);
    expect(v1).toEqual({ count: 1 });
    expect(v2).toEqual({ count: 1 });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('memoise re-runs the producer for different keys', async () => {
    const svc = new CacheService(null);
    const producer = vi.fn(async (input: { x: number }) => ({ doubled: input.x * 2 }));
    await svc.memoize('test', { x: 1 }, 60, () => producer({ x: 1 }));
    await svc.memoize('test', { x: 2 }, 60, () => producer({ x: 2 }));
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache producer errors', async () => {
    const svc = new CacheService(null);
    let calls = 0;
    const producer = async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return 'ok';
    };
    await expect(svc.memoize('e', { a: 1 }, 60, producer)).rejects.toThrow('boom');
    const second = await svc.memoize('e', { a: 1 }, 60, producer);
    expect(second).toBe('ok');
    expect(calls).toBe(2);
  });

  it('survives a Redis client throwing on GET/SET (degrades to miss)', async () => {
    const badRedis = {
      get: vi.fn().mockRejectedValue(new Error('disconnected')),
      set: vi.fn().mockRejectedValue(new Error('disconnected')),
      del: vi.fn().mockRejectedValue(new Error('disconnected')),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new CacheService(badRedis as any);
    expect(svc.enabled()).toBe(true);
    await svc.set('k', 'v', 60); // should not throw
    expect(await svc.get('k')).toBeNull(); // graceful miss
    await svc.del('k'); // should not throw
  });
});
