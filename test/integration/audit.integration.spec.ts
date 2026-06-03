import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { AuditService } from '../../src/modules/audit/audit.service';
import { hasDb, makeIntegrationHarness, type IntegrationHarness } from './harness';

const d = hasDb ? describe : describe.skip;

d('AuditService — Postgres integration (HMAC chain)', () => {
  let h: IntegrationHarness;
  let svc: AuditService;

  beforeAll(() => {
    h = makeIntegrationHarness();
  });

  // AuditService caches the previous row's HMAC in memory to avoid a
  // round-trip per insert. That cache must NOT survive a between-test
  // TRUNCATE — otherwise the NEXT test's first row will carry a stale
  // prev_hmac that no longer matches anything in the table, and
  // verifyChain reports the chain as broken (the cached value !== null
  // for what is now the first row). Production code never resets
  // audit_events, so the cache is correct there; for tests we rebuild
  // the service from scratch.
  beforeEach(async () => {
    await h.resetTables();
    svc = new AuditService(h.log, h.config, h.db);
  });

  afterAll(async () => {
    await h.close();
  });

  it('writes three linked rows; verifyChain returns ok', async () => {
    await svc.record({ type: 'api_key.created', actorId: 'op-1' });
    await svc.record({ type: 'api_key.created', actorId: 'op-1' });
    await svc.record({ type: 'cds.evaluated', ruleId: 'ddi-check', ruleVersion: '0.1.0' });

    const res = await svc.verifyChain();
    expect(res.ok).toBe(true);

    // Inspect the chain: row n+1's prev_hmac equals row n's hmac.
    const rows = await h.db.execute<{ id: number; prev_hmac: string | null; hmac: string }>(
      sql`SELECT id, prev_hmac, hmac FROM audit_events ORDER BY id`,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].prev_hmac).toBeNull();
    expect(rows[1].prev_hmac).toBe(rows[0].hmac);
    expect(rows[2].prev_hmac).toBe(rows[1].hmac);
  });

  it('verifyChain detects a row mutated in place', async () => {
    await svc.record({ type: 'api_key.created', actorId: 'op-1' });
    await svc.record({ type: 'api_key.revoked', actorId: 'op-1' });

    // Out-of-band tamper.
    await h.db.execute(
      sql`UPDATE audit_events SET event_type = 'cds.evaluated' WHERE id = (SELECT MIN(id) FROM audit_events)`,
    );

    const res = await svc.verifyChain();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.brokenAt).toBe(0);
  });

  it('actor_hash / subject_hash are 64-hex; raw identifiers never appear on the row', async () => {
    await svc.record({
      type: 'cds.evaluated',
      actorId: 'integrator-penda',
      subjectId: 'request-correlation-123',
    });
    const rows = await h.db.execute<{
      actor_hash: string;
      subject_hash: string;
      event_type: string;
    }>(sql`SELECT actor_hash, subject_hash, event_type FROM audit_events`);
    expect(rows[0].actor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].subject_hash).toMatch(/^[0-9a-f]{64}$/);
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toContain('integrator-penda');
    expect(serialized).not.toContain('request-correlation-123');
  });

  it('survives a chain-cache reset (loads last hmac from DB on next write)', async () => {
    await svc.record({ type: 'api_key.created', actorId: 'op-1' });

    // Construct a NEW AuditService instance pointing at the same DB.
    // It has no cached lastHmac; it must read it from the table.
    const svc2 = new AuditService(h.log, h.config, h.db);
    await svc2.record({ type: 'api_key.revoked', actorId: 'op-1' });

    const res = await svc2.verifyChain();
    expect(res.ok).toBe(true);
  });
});
