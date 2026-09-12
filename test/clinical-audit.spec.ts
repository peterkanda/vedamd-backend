import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ClinicalAuditInterceptor } from '../src/modules/audit/clinical-audit.interceptor';
import type { AuditService } from '../src/modules/audit/audit.service';
import type { IntegrationLogService } from '../src/modules/integration-log/integration-log.service';
import type { ClinicalAuditStash } from '../src/modules/audit/clinical-audit.types';

/**
 * The ledger and the integration log were fully built and never called, so no
 * test failed and the gap survived. These assert the wiring itself: a clinical
 * request must produce rows, carrying the provider AND the model.
 */

function makeContext(req: Record<string, unknown>, statusCode = 200) {
  const res = { statusCode };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

const handler = (): CallHandler => ({ handle: () => of({ ok: true }) });

function makeDeps() {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const integrationLog = { record: vi.fn().mockResolvedValue(undefined) };
  const config = { get: () => 'test-secret' };
  const interceptor = new ClinicalAuditInterceptor(
    audit as unknown as AuditService,
    integrationLog as unknown as IntegrationLogService,
    config as never,
  );
  return { audit, integrationLog, interceptor };
}

const apiKey = {
  keyId: 'key-1',
  integratorId: 'int-1',
  fingerprint: 'abcd1234',
  scopes: [],
  environment: 'production',
};

const agenticStash: ClinicalAuditStash = {
  kind: 'agentic',
  hook: 'medication-prescribe',
  llmInvoked: true,
  llmProvider: 'openrouter',
  llmModel: 'google/medgemma-27b-text-it',
  llmMedical: true,
  cardsReturned: 2,
  cardSummaries: ['Avoid naproxen with warfarin', 'Renal dose adjustment'],
  citations: [{ kind: 'ddi', id: 'naproxen+warfarin' }],
};

describe('clinical audit trail is actually written', () => {
  it('records a ledger row for a clinical request', async () => {
    const { audit, interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: {},
      apiKey,
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: agenticStash,
    };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler()));
    await vi.waitFor(() => expect(audit.record).toHaveBeenCalledTimes(1));

    const event = audit.record.mock.calls[0][0];
    expect(event.type).toBe('cds.evaluated');
    expect(event.tenantId).toBe('int-1');
    expect(event.endpoint).toBe('/v1/agentic/evaluate');
    expect(event.statusCode).toBe(200);
    // The correlation id must be hashed, never stored raw.
    expect(event.requestId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records the model that answered, not just the provider', async () => {
    const { integrationLog, interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: {},
      apiKey,
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: agenticStash,
    };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler()));
    await vi.waitFor(() => expect(integrationLog.record).toHaveBeenCalledTimes(1));

    const [integratorId, entry] = integrationLog.record.mock.calls[0];
    expect(integratorId).toBe('int-1');
    expect(entry.llm_invoked).toBe(true);
    expect(entry.llm_provider).toBe('openrouter');
    // The whole point: "openrouter" alone cannot answer which model advised.
    expect(entry.llm_model).toBe('google/medgemma-27b-text-it');
    expect(entry.llm_medical).toBe(true);
    expect(entry.cards_returned_count).toBe(2);
    expect(entry.citations).toEqual([
      { label: 'ddi:naproxen+warfarin', url: '/app/ddi/naproxen%2Bwarfarin' },
    ]);
    expect(entry.environment).toBe('production');
  });

  it('writes nothing for a non-clinical request', async () => {
    const { audit, integrationLog, interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: {},
      apiKey,
      routeOptions: { url: '/v1/health' },
    };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler()));
    expect(audit.record).not.toHaveBeenCalled();
    expect(integrationLog.record).not.toHaveBeenCalled();
  });

  it('honours an inbound x-request-id so a trail can be followed end to end', async () => {
    const { interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: { 'x-request-id': 'caller-supplied-id' },
      apiKey,
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: agenticStash,
    };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler()));
    expect(req.vedamdRequestId).toBe('caller-supplied-id');
  });

  it('records the clinician chat path, which has no integrator', async () => {
    const { audit, integrationLog, interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: {},
      routeOptions: { url: '/v1/assistant/chat' },
      vedamdAudit: {
        kind: 'assistant',
        llmInvoked: true,
        llmProvider: 'openrouter',
        llmModel: 'google/medgemma-27b-text-it',
        actorId: 'supabase-user-1',
      } satisfies ClinicalAuditStash,
    };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler()));
    await vi.waitFor(() => expect(audit.record).toHaveBeenCalledTimes(1));

    expect(audit.record.mock.calls[0][0].type).toBe('assistant.chat');
    // The per-integrator log is for integrator traffic; a clinician session
    // has no integrator, so only the ledger row applies.
    expect(integrationLog.record).not.toHaveBeenCalled();
  });

  it('never fails the response when an audit write throws', async () => {
    const { audit, interceptor } = makeDeps();
    audit.record.mockRejectedValue(new Error('ledger unavailable'));
    const req: Record<string, unknown> = {
      headers: {},
      apiKey,
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: agenticStash,
    };
    await expect(
      lastValueFrom(interceptor.intercept(makeContext(req), handler())),
    ).resolves.toEqual({ ok: true });
  });

  it('categorises a failed clinical request', async () => {
    const { integrationLog, interceptor } = makeDeps();
    const req: Record<string, unknown> = {
      headers: {},
      apiKey,
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: agenticStash,
    };
    await lastValueFrom(interceptor.intercept(makeContext(req, 503), handler()));
    await vi.waitFor(() => expect(integrationLog.record).toHaveBeenCalledTimes(1));
    expect(integrationLog.record.mock.calls[0][1].error_category).toBe('downstream');
  });
});
