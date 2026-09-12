import { describe, expect, it, vi } from 'vitest';
import { DeviceAuditService } from '../src/modules/device-audit/device-audit.service';
import type { DeviceAnswerReport } from '../src/modules/device-audit/device-audit.types';
import { MAX_REPORTS_PER_SYNC } from '../src/modules/device-audit/device-audit.types';

/**
 * The on-device assistant answers with no network, so these reports are the
 * only audit trail that path has. They arrive from a client we do not control,
 * so the boundary has to be strict about what it will store — and must never
 * accept anything that could carry the question, the answer or patient detail.
 */

function makeService(withDb = true) {
  const inserted: Array<Record<string, unknown>> = [];
  const db = withDb
    ? {
        insert: () => ({
          values: (rows: Array<Record<string, unknown>>) => ({
            onConflictDoNothing: () => {
              inserted.push(...rows);
              return Promise.resolve();
            },
          }),
        }),
      }
    : null;
  const config = { get: () => 'test-secret' };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const svc = new DeviceAuditService(config as never, log as never, db as never);
  return { svc, inserted, log };
}

const valid: DeviceAnswerReport = {
  clientEventId: 'evt-1',
  occurredAt: '2026-09-11T10:00:00.000Z',
  questionHash: 'abc123',
  engine: 'ondevice',
  modelVersion: 'medgemma-4b-it-q4_k_m',
  contentVersion: 'v0.1.0',
  grounded: true,
  refused: false,
  complete: true,
  sourceIds: ['drugs/amoxicillin'],
  latencyMs: 4200,
  appVersion: '0.1.0',
};

describe('on-device answer sync', () => {
  it('stores a valid report with the model build that answered', async () => {
    const { svc, inserted } = makeService();
    expect(await svc.sync('clinician-1', [valid])).toEqual({ accepted: 1, rejected: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].modelVersion).toBe('medgemma-4b-it-q4_k_m');
    expect(inserted[0].grounded).toBe(true);
    expect(inserted[0].sourceIds).toEqual(['drugs/amoxicillin']);
  });

  it('hashes the clinician id and never stores it raw', async () => {
    const { svc, inserted } = makeService();
    await svc.sync('clinician-1', [valid]);
    expect(inserted[0].actorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(inserted)).not.toContain('clinician-1');
  });

  it('rejects a report carrying a field the contract never agreed to', async () => {
    const { svc, inserted } = makeService();
    // A client trying to attach the question text must be refused outright,
    // not partially stored.
    const smuggled = { ...valid, questionText: 'What is the dose of amoxicillin?' };
    expect(await svc.sync('clinician-1', [smuggled as DeviceAnswerReport])).toEqual({
      accepted: 0,
      rejected: 1,
    });
    expect(inserted).toHaveLength(0);
  });

  it('drops a malformed report without losing the rest of the batch', async () => {
    const { svc, inserted } = makeService();
    const bad = { ...valid, clientEventId: 'evt-2', occurredAt: 'not-a-date' };
    const alsoBad = { ...valid, clientEventId: 'evt-3', grounded: 'yes' as unknown as boolean };
    const res = await svc.sync('clinician-1', [
      valid,
      bad as DeviceAnswerReport,
      alsoBad as DeviceAnswerReport,
    ]);
    // A phone offline for a week must not lose its whole history to one bad row.
    expect(res).toEqual({ accepted: 1, rejected: 2 });
    expect(inserted).toHaveLength(1);
  });

  it('caps an oversized batch rather than accepting it all', async () => {
    const { svc, inserted } = makeService();
    const many = Array.from({ length: MAX_REPORTS_PER_SYNC + 25 }, (_, i) => ({
      ...valid,
      clientEventId: `evt-${i}`,
    }));
    const res = await svc.sync('clinician-1', many);
    expect(res.accepted).toBe(MAX_REPORTS_PER_SYNC);
    expect(res.rejected).toBe(25);
    expect(inserted).toHaveLength(MAX_REPORTS_PER_SYNC);
  });

  it('clamps over-long strings instead of storing them', async () => {
    const { svc, inserted } = makeService();
    await svc.sync('clinician-1', [{ ...valid, engine: 'x'.repeat(5000) }]);
    expect((inserted[0].engine as string).length).toBeLessThanOrEqual(200);
  });

  it('still records to the PHI-free log when there is no database', async () => {
    const { svc, log } = makeService(false);
    expect(await svc.sync('clinician-1', [valid])).toEqual({ accepted: 1, rejected: 0 });
    // Losing the DB must not lose the trail entirely.
    expect(log.info).toHaveBeenCalledTimes(1);
    const payload = log.info.mock.calls[0][1];
    expect(payload.llm_model).toBe('medgemma-4b-it-q4_k_m');
    expect(payload.actor_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records a refusal, which is the gate working rather than a failure', async () => {
    const { svc, inserted } = makeService();
    await svc.sync('clinician-1', [
      { ...valid, engine: 'refused', grounded: false, refused: true },
    ]);
    expect(inserted[0].refused).toBe(true);
    expect(inserted[0].engine).toBe('refused');
  });
});
