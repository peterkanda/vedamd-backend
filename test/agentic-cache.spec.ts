import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AgenticService } from '../src/modules/agentic/agentic.service';
import { CacheService } from '../src/common/cache/cache.service';
import type { AppConfig } from '../src/config/configuration';

function makeConfigWithTtl(ttl: number): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'redis.cdsEvaluateTtlSeconds') return ttl;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe('AgenticService — deterministic result cache', () => {
  it('memoises identical contexts so CdsService is hit only once', async () => {
    const cds = {
      evaluateHook: vi.fn().mockResolvedValue({ cards: [] }),
    };
    const retriever = { retrieve: () => ({}), totalRecords: () => 0 };
    const router = { anyConfigured: () => false, complete: vi.fn() };
    const cache = new CacheService(null);

    const svc = new AgenticService(
      retriever as never,
      router as never,
      cds as never,
      cache,
      makeConfigWithTtl(60),
      { info: () => undefined, warn: () => undefined } as never,
    );

    const ctx = {
      mode: 'deterministic' as const,
      medications: ['warfarin'],
      diagnoses: ['atrial fibrillation'],
      patient: { ageYears: 70 },
    };

    await svc.evaluate(ctx);
    await svc.evaluate(ctx);
    // Two hooks (medication-prescribe + patient-view) per uncached call.
    expect(cds.evaluateHook).toHaveBeenCalledTimes(2);
  });

  it('does not collapse contexts that differ only in case / whitespace ordering of medications', async () => {
    const cds = {
      evaluateHook: vi.fn().mockResolvedValue({ cards: [] }),
    };
    const retriever = { retrieve: () => ({}), totalRecords: () => 0 };
    const router = { anyConfigured: () => false };
    const cache = new CacheService(null);

    const svc = new AgenticService(
      retriever as never,
      router as never,
      cds as never,
      cache,
      makeConfigWithTtl(60),
      { info: () => undefined, warn: () => undefined } as never,
    );

    // These normalise to the same set (lowercase + sorted), so should hit cache.
    await svc.evaluate({ mode: 'deterministic', medications: ['Warfarin', 'aspirin'] });
    await svc.evaluate({ mode: 'deterministic', medications: ['aspirin', 'warfarin'] });
    expect(cds.evaluateHook).toHaveBeenCalledTimes(2); // first call only

    // A genuinely different context (different med) should NOT hit cache.
    await svc.evaluate({ mode: 'deterministic', medications: ['rivaroxaban'] });
    expect(cds.evaluateHook).toHaveBeenCalledTimes(4); // +2 from the new call
  });
});
