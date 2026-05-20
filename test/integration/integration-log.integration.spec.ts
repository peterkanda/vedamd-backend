import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IntegrationLogService } from '../../src/modules/integration-log/integration-log.service';
import type { IntegrationLogEntry } from '../../src/modules/integration-log/integration-log.types';
import { hasDb, makeIntegrationHarness, type IntegrationHarness } from './harness';

const d = hasDb ? describe : describe.skip;

function entry(
  requestId: string,
  overrides: Partial<IntegrationLogEntry> = {},
): IntegrationLogEntry {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    environment: 'sandbox',
    api_key_fingerprint: 'abcdef12',
    endpoint: 'POST /cds-services/vedamd-medication-prescribe',
    latency_ms: 12,
    status_code: 200,
    error_category: 'none',
    rules_evaluated: [{ rule_id: 'ddi-check', rule_version: '0.1.0', fired: true }],
    cards_returned_count: 1,
    card_summaries: ['MODERATE interaction: paracetamol ↔ warfarin'],
    citations: [{ label: 'WHO Model Formulary', url: 'https://example.org/who' }],
    llm_invoked: false,
    llm_provider: null,
    override_reported: false,
    ...overrides,
  };
}

d('IntegrationLogService — Postgres integration', () => {
  let h: IntegrationHarness;
  let svc: IntegrationLogService;

  beforeAll(() => {
    h = makeIntegrationHarness({ maxEntries: 5, ttlDays: 30 });
    svc = new IntegrationLogService(h.config, h.db);
  });

  beforeEach(async () => {
    await h.resetTables();
  });

  afterAll(async () => {
    await h.close();
  });

  it('persists an entry and returns it via query newest-first', async () => {
    const now = Date.now();
    await svc.record('penda', entry('req-1', { timestamp: new Date(now - 2000).toISOString() }));
    await svc.record('penda', entry('req-2', { timestamp: new Date(now - 1000).toISOString() }));

    const out = await svc.query('penda');
    expect(out.map((e) => e.request_id)).toEqual(['req-2', 'req-1']);
    expect(out[0].card_summaries).toEqual(['MODERATE interaction: paracetamol ↔ warfarin']);
    expect(out[0].rules_evaluated).toEqual([
      { rule_id: 'ddi-check', rule_version: '0.1.0', fired: true },
    ]);
  });

  it('does not leak rows across integrators', async () => {
    await svc.record('penda', entry('p-1'));
    await svc.record('mydawa', entry('m-1'));

    const penda = await svc.query('penda');
    const mydawa = await svc.query('mydawa');
    expect(penda.map((e) => e.request_id)).toEqual(['p-1']);
    expect(mydawa.map((e) => e.request_id)).toEqual(['m-1']);
  });

  it('is idempotent on a replayed request_id (ON CONFLICT DO NOTHING)', async () => {
    await svc.record('penda', entry('req-replay', { latency_ms: 10 }));
    await svc.record('penda', entry('req-replay', { latency_ms: 99 }));
    const rows = await svc.query('penda');
    expect(rows).toHaveLength(1);
    expect(rows[0].latency_ms).toBe(10);
  });

  it('refuses an entry with a forbidden field at the service boundary', async () => {
    await expect(
      svc.record('penda', {
        ...entry('req-bad'),
        // @ts-expect-error — forbidden
        patient_id: 'leaked',
      }),
    ).rejects.toThrow(/not on the allow-list/);
  });
});
