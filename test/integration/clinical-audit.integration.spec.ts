import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AuditService } from '../../src/modules/audit/audit.service';
import { IntegrationLogService } from '../../src/modules/integration-log/integration-log.service';
import { ClinicalAuditInterceptor } from '../../src/modules/audit/clinical-audit.interceptor';
import type { ClinicalAuditStash } from '../../src/modules/audit/clinical-audit.types';
import { hasDb, makeIntegrationHarness, type IntegrationHarness } from './harness';

const d = hasDb ? describe : describe.skip;

/**
 * Composition test: the interceptor, the real AuditService and the real
 * IntegrationLogService against a real Postgres.
 *
 * The unit specs prove the interceptor calls both services and the service
 * specs prove each writes correctly, but nothing proved the whole path lands
 * rows in the database — which is exactly the kind of gap that let the trail
 * go unwritten in the first place.
 */
d('clinical audit trail — end to end against Postgres', () => {
  let h: IntegrationHarness;
  let interceptor: ClinicalAuditInterceptor;
  let audit: AuditService;

  beforeAll(() => {
    h = makeIntegrationHarness();
  });

  beforeEach(async () => {
    await h.resetTables();
    audit = new AuditService(h.log, h.config, h.db);
    const integrationLog = new IntegrationLogService(h.config, h.db);
    interceptor = new ClinicalAuditInterceptor(audit, integrationLog, h.config);
  });

  afterAll(async () => {
    await h.close();
  });

  function run(stash: ClinicalAuditStash, statusCode = 200) {
    const req: Record<string, unknown> = {
      headers: {},
      apiKey: {
        keyId: 'key-1',
        integratorId: 'int-1',
        fingerprint: 'abcd1234',
        scopes: [],
        environment: 'production',
      },
      routeOptions: { url: '/v1/agentic/evaluate' },
      vedamdAudit: stash,
    };
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ statusCode }),
      }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of({ ok: true }) };
    return lastValueFrom(interceptor.intercept(ctx, handler));
  }

  const stash: ClinicalAuditStash = {
    kind: 'agentic',
    hook: 'medication-prescribe',
    llmInvoked: true,
    llmProvider: 'openrouter',
    llmModel: 'google/medgemma-27b-text-it',
    llmMedical: true,
    cardsReturned: 1,
    cardSummaries: ['Avoid naproxen with warfarin'],
    citations: [{ kind: 'ddi', id: 'naproxen+warfarin' }],
    rulesEvaluated: [{ rule_id: 'ddi-check', rule_version: '0.1.0', fired: true }],
  };

  it('lands a ledger row and an integration-log row, and the chain verifies', async () => {
    await run(stash);

    // The write is fire-and-forget off the response path, so give it a beat.
    await new Promise((r) => setTimeout(r, 250));

    const ledger = await h.db.execute<{ event_type: string; endpoint: string; hmac: string }>(
      sql`SELECT event_type, endpoint, hmac FROM audit_events ORDER BY id`,
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].event_type).toBe('cds.evaluated');
    expect(ledger[0].endpoint).toBe('/v1/agentic/evaluate');

    const log = await h.db.execute<{
      llm_provider: string;
      llm_model: string;
      llm_medical: boolean;
      cards_returned_count: number;
    }>(sql`SELECT llm_provider, llm_model, llm_medical, cards_returned_count FROM integration_log`);
    expect(log).toHaveLength(1);
    expect(log[0].llm_provider).toBe('openrouter');
    // The question an incident review actually asks.
    expect(log[0].llm_model).toBe('google/medgemma-27b-text-it');
    expect(log[0].llm_medical).toBe(true);
    expect(log[0].cards_returned_count).toBe(1);

    expect(await audit.verifyChain()).toEqual({ ok: true });
  });

  it('keeps the chain verifiable across several clinical requests', async () => {
    await run(stash);
    await run({ ...stash, cardsReturned: 2 });
    await run({ ...stash, llmInvoked: false, llmProvider: undefined, llmModel: undefined });
    await new Promise((r) => setTimeout(r, 400));

    const rows = await h.db.execute<{ prev_hmac: string | null; hmac: string }>(
      sql`SELECT prev_hmac, hmac FROM audit_events ORDER BY id`,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].prev_hmac).toBeNull();
    expect(rows[1].prev_hmac).toBe(rows[0].hmac);
    expect(rows[2].prev_hmac).toBe(rows[1].hmac);
    expect(await audit.verifyChain()).toEqual({ ok: true });
  });

  it('records no question or answer text anywhere in the trail', async () => {
    await run(stash);
    await new Promise((r) => setTimeout(r, 250));

    // The audit trail records what was decided and on what evidence — never
    // the consultation. A regression here would be a privacy incident.
    const dump = JSON.stringify([
      await h.db.execute(sql`SELECT * FROM audit_events`),
      await h.db.execute(sql`SELECT * FROM integration_log`),
    ]);
    expect(dump).not.toMatch(/patient/i);
    expect(dump.toLowerCase()).not.toContain('what is the dose');
  });

  it('survives a process restart with the chain intact', async () => {
    await run(stash);
    await new Promise((r) => setTimeout(r, 250));

    // A fresh instance is what a redeploy gives you. With a stable
    // AUDIT_HASH_SECRET the chain must still verify — this is precisely what
    // an ephemeral per-boot secret would break.
    const restarted = new AuditService(h.log, h.config, h.db);
    await restarted.record({ type: 'cds.evaluated', actorId: 'op-2' });
    expect(await restarted.verifyChain()).toEqual({ ok: true });
  });
});
