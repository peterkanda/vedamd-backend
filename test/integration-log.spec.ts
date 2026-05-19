import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { IntegrationLogService } from '../src/modules/integration-log/integration-log.service';
import type { AppConfig } from '../src/config/configuration';

function makeService(): IntegrationLogService {
  const config = {
    get: (key: string) => {
      if (key === 'integrationLog.maxEntriesPerIntegrator') return 3;
      if (key === 'integrationLog.ttlDays') return 30;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  return new IntegrationLogService(config, null);
}

describe('IntegrationLogService (in-memory mode)', () => {
  it('records and queries entries newest-first', async () => {
    const svc = makeService();
    const now = Date.now();
    await svc.record('int-1', baseEntry('req-1', new Date(now - 2000).toISOString()));
    await svc.record('int-1', baseEntry('req-2', new Date(now - 1000).toISOString()));

    const out = await svc.query('int-1');
    expect(out.map((e) => e.request_id)).toEqual(['req-2', 'req-1']);
  });

  it('evicts FIFO when capacity is exceeded (FR-332)', async () => {
    const svc = makeService(); // capacity 3
    for (let i = 0; i < 5; i += 1) {
      await svc.record('int-1', baseEntry(`req-${i}`, new Date(Date.now() + i).toISOString()));
    }
    const out = await svc.query('int-1', { limit: 10 });
    expect(out.length).toBe(3);
    expect(out.map((e) => e.request_id)).toEqual(['req-4', 'req-3', 'req-2']);
  });

  it('refuses entries with fields outside the allow-list (FR-335)', async () => {
    const svc = makeService();
    await expect(
      svc.record('int-1', {
        ...baseEntry('req-x'),
        // @ts-expect-error — intentionally forbidden field
        patient_id: 'leaked',
      }),
    ).rejects.toThrow(/not on the allow-list/);
  });
});

function baseEntry(requestId: string, ts = new Date().toISOString()) {
  return {
    request_id: requestId,
    timestamp: ts,
    environment: 'sandbox' as const,
    api_key_fingerprint: 'abcdef12',
    endpoint: 'POST /cds-services/x',
    latency_ms: 10,
    status_code: 200,
    error_category: 'none' as const,
    rules_evaluated: [],
    cards_returned_count: 0,
    card_summaries: [],
    citations: [],
    llm_invoked: false,
    llm_provider: null,
    override_reported: false,
  };
}
