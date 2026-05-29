import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ClinicalAuditsService } from '../src/modules/clinical-audits/clinical-audits.service';
import type { SqlIngestionService } from '../src/modules/agentic/connectors/sql-ingestion.service';
import type { CustomRulesService } from '../src/modules/custom-rules/custom-rules.service';
import type { PoliciesService } from '../src/modules/policies/policies.service';
import type { NotificationsService } from '../src/modules/notifications/notifications.service';

/**
 * Wire up the clinical-audits service with fake collaborators so we
 * can test the on-demand audit flow end-to-end without standing up
 * Postgres / real connectors / live SMTP.
 */
function makeService(opts: {
  rows: Array<Record<string, unknown>>;
  matchedRuleIds: string[];
  policyHits?: Array<{ policyId: string; sectionTitle?: string; snippet: string }>;
  notifyOk?: boolean;
}): { svc: ClinicalAuditsService; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => ({
    ok: opts.notifyOk ?? true,
    status: opts.notifyOk === false ? 'failed' : 'sent',
    error: opts.notifyOk === false ? 'simulated provider failure' : undefined,
  }));

  const sql = {
    getRegisteredConnection: vi.fn(() => ({ id: 'conn', dialect: 'postgres', url: 'postgresql://db.example.com/app' })),
    getRegisteredQuery: vi.fn(() => ({ id: 'q', sql: 'SELECT 1', mapping: {} })),
    fetchRows: vi.fn(async () => ({
      rows: opts.rows,
      mapping: {
        medicationColumn: 'med',
        diagnosisColumn: 'dx',
      },
    })),
  } as unknown as SqlIngestionService;

  const rules = {
    evaluate: vi.fn(async () =>
      opts.matchedRuleIds.map((id) => ({
        rule: { id, name: `Rule ${id}`, description: '', indicator: 'warning', enabled: true },
        card: { summary: id, indicator: 'warning', source: { label: 'test' } },
      })),
    ),
  } as unknown as CustomRulesService;

  const policies = {
    findRelevant: vi.fn(async () => opts.policyHits ?? []),
  } as unknown as PoliciesService;

  const notifications = {
    send: sendSpy,
  } as unknown as NotificationsService;

  const svc = new ClinicalAuditsService(null, sql, rules, policies, notifications);
  svc.onModuleInit();
  return { svc, sendSpy };
}

describe('ClinicalAuditsService — CRUD', () => {
  it('creates an audit and lists it integrator-scoped', async () => {
    const { svc } = makeService({ rows: [], matchedRuleIds: [] });
    const created = await svc.create('tenant-A', {
      name: 'Polypharmacy audit',
      connectionId: 'conn-1',
      namedQueryId: 'q-meds',
      customRuleIds: ['rule-polypharmacy'],
      threshold: { kind: 'percentage', value: 10 },
    });
    expect(created.id).toBeDefined();
    const list = await svc.list('tenant-A');
    expect(list.map((a) => a.id)).toContain(created.id);
    // Other tenant cannot see it.
    expect((await svc.list('tenant-B')).map((a) => a.id)).not.toContain(created.id);
  });

  it('rejects an audit whose connection is not registered', async () => {
    const sql = {
      getRegisteredConnection: vi.fn(() => null),
      getRegisteredQuery: vi.fn(() => ({ id: 'q', sql: 'SELECT 1', mapping: {} })),
      fetchRows: vi.fn(),
    } as unknown as SqlIngestionService;
    const svc = new ClinicalAuditsService(
      null,
      sql,
      { evaluate: vi.fn() } as unknown as CustomRulesService,
      { findRelevant: vi.fn() } as unknown as PoliciesService,
      { send: vi.fn() } as unknown as NotificationsService,
    );
    svc.onModuleInit();
    await expect(
      svc.create('tenant-A', {
        name: 'no conn',
        connectionId: 'ghost',
        namedQueryId: 'q',
        customRuleIds: [],
        threshold: { kind: 'absolute', value: 1 },
      }),
    ).rejects.toThrow(/not registered/);
  });

  it('rejects an invalid threshold at create time', async () => {
    const { svc } = makeService({ rows: [], matchedRuleIds: [] });
    await expect(
      svc.create('tenant-A', {
        name: 'Bad threshold',
        connectionId: 'c',
        namedQueryId: 'q',
        customRuleIds: [],
        threshold: { kind: 'percentage', value: 250 },
      }),
    ).rejects.toThrow(/percentage/);
  });
});

describe('ClinicalAuditsService — on-demand run', () => {
  let svc: ClinicalAuditsService;
  let sendSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ svc, sendSpy } = makeService({
      // 10 rows; 4 will breach because the fake rules service always
      // returns a match. We restrict the audit's customRuleIds allow-list
      // so only matched-AND-allowed counts.
      rows: Array.from({ length: 10 }, (_, i) => ({
        med: i < 4 ? 'warfarin' : 'paracetamol',
        dx: 'atrial-fibrillation',
      })),
      matchedRuleIds: ['rule-polypharmacy'],
      policyHits: [
        { policyId: 'pol-1', sectionTitle: 'Anticoag bridging', snippet: 'Bridge with LMWH ...' },
      ],
    }));
  });

  it('runs an audit, returns row-level verdicts (anonymous), and reports breach %', async () => {
    const audit = await svc.create('tenant-A', {
      name: 'AF audit',
      connectionId: 'c',
      namedQueryId: 'q',
      customRuleIds: ['rule-polypharmacy'],
      policyIds: ['pol-1'],
      threshold: { kind: 'percentage', value: 5 },
      channelIds: ['ch-1'],
    });
    const result = await svc.runAudit('tenant-A', audit.id);

    expect(result.totalRows).toBe(10);
    expect(result.breachedRows).toBe(10); // every row matched (fake)
    expect(result.breachPct).toBe(100);
    expect(result.thresholdBreached).toBe(true);
    // Verdicts only carry the row index — no row content disclosure.
    expect(result.verdicts[0]).toHaveProperty('rowIndex');
    expect(result.verdicts[0].breachedRuleIds).toContain('rule-polypharmacy');
    expect(result.verdicts[0].policyCitations[0].policyId).toBe('pol-1');
  });

  it('dispatches to every configured channel when the threshold trips', async () => {
    const audit = await svc.create('tenant-A', {
      name: 'AF',
      connectionId: 'c',
      namedQueryId: 'q',
      customRuleIds: ['rule-polypharmacy'],
      threshold: { kind: 'absolute', value: 1 },
      channelIds: ['ch-1', 'ch-2'],
    });
    const result = await svc.runAudit('tenant-A', audit.id);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(result.dispatches).toHaveLength(2);
    expect(result.dispatches.every((d) => d.ok)).toBe(true);
  });

  it('does NOT dispatch when threshold is not breached', async () => {
    // Override service with rules that match zero rows.
    const { svc: quietSvc, sendSpy: quietSpy } = makeService({
      rows: [{ med: 'a' }, { med: 'b' }],
      matchedRuleIds: [], // nothing matches → no breaches
    });
    const audit = await quietSvc.create('tenant-A', {
      name: 'Quiet',
      connectionId: 'c',
      namedQueryId: 'q',
      customRuleIds: ['rule-x'],
      threshold: { kind: 'absolute', value: 1 },
      channelIds: ['ch-1'],
    });
    const result = await quietSvc.runAudit('tenant-A', audit.id);
    expect(result.thresholdBreached).toBe(false);
    expect(quietSpy).not.toHaveBeenCalled();
  });

  it('returns the error inline when the named-query fetch fails', async () => {
    const failingSql = {
      getRegisteredConnection: vi.fn(() => ({ id: 'bad-conn', dialect: 'postgres', url: 'postgresql://db.example.com/app' })),
      getRegisteredQuery: vi.fn(() => ({ id: 'q', sql: 'SELECT 1', mapping: {} })),
      fetchRows: vi.fn(async () => {
        throw new Error('Unknown connectionId: bad-conn');
      }),
    } as unknown as SqlIngestionService;
    const failSvc = new ClinicalAuditsService(
      null,
      failingSql,
      { evaluate: vi.fn() } as unknown as CustomRulesService,
      { findRelevant: vi.fn() } as unknown as PoliciesService,
      { send: vi.fn() } as unknown as NotificationsService,
    );
    failSvc.onModuleInit();
    const audit = await failSvc.create('tenant-A', {
      name: 'broken',
      connectionId: 'bad-conn',
      namedQueryId: 'q',
      customRuleIds: [],
      threshold: { kind: 'absolute', value: 1 },
    });
    const result = await failSvc.runAudit('tenant-A', audit.id);
    expect(result.error).toMatch(/Unknown connectionId/);
    expect(result.totalRows).toBe(0);
  });

  it('refuses to run a disabled audit', async () => {
    const audit = await svc.create('tenant-A', {
      name: 'disabled',
      connectionId: 'c',
      namedQueryId: 'q',
      customRuleIds: ['rule-polypharmacy'],
      threshold: { kind: 'absolute', value: 1 },
      enabled: false,
    });
    const result = await svc.runAudit('tenant-A', audit.id);
    expect(result.totalRows).toBe(0);
    expect(result.error).toMatch(/disabled/i);
  });
});
