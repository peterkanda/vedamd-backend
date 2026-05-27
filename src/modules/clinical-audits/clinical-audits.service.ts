import { Inject, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { clinicalAudits as auditsTable } from '../../db/schema';
import { SqlIngestionService } from '../agentic/connectors/sql-ingestion.service';
import { CustomRulesService } from '../custom-rules/custom-rules.service';
import { PoliciesService } from '../policies/policies.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AuditCreateDto,
  AuditDispatchOutcome,
  AuditRowVerdict,
  AuditRunResult,
  AuditSummary,
  AuditThreshold,
  AuditUpdateDto,
} from './clinical-audits.types';
import type { QueryMapping } from '../agentic/connectors/sql-connector.types';

interface MemRow {
  id: string;
  integratorId: string;
  name: string;
  description?: string | null;
  connectionId: string;
  namedQueryId: string;
  queryParams: Record<string, string | number>;
  customRuleIds: string[];
  policyIds: string[];
  threshold: AuditThreshold;
  channelIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastRunAt?: string | null;
}

/**
 * Per-integrator clinical-audit definitions + on-demand runner.
 *
 * Flow per `runAudit()`:
 *   1. Resolve the audit by id (integrator-scoped).
 *   2. Call SqlIngestionService.fetchRows to pull raw rows from the
 *      integrator's database via the registered named query.
 *   3. For each row, normalise the row into evaluation signals
 *      (medications / diagnoses / labs etc) and call CustomRulesService.
 *   4. For rows that breach ≥ 1 rule, ask PoliciesService for relevant
 *      sections so the verdict carries a real citation, not invention.
 *   5. Compute breach count vs threshold (absolute or %).
 *   6. If threshold breached, dispatch to every configured channel via
 *      NotificationsService.send (PHI-free body: rule IDs + counts).
 *   7. Return the full structured result. Verdicts include row index
 *      only — no row-content disclosure.
 *
 * Anti-hallucination guarantees:
 *   - Policy citations come from the integrator's uploaded policy
 *     sections, not the LLM
 *   - The audit body sent to channels references rule IDs + cited
 *     policy ids/sections — never patient identifiers, never invented
 *     justifications
 */
@Injectable()
export class ClinicalAuditsService implements OnModuleInit {
  private readonly nestLogger = new Logger(ClinicalAuditsService.name);
  private readonly memByIntegrator = new Map<string, MemRow[]>();

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null,
    private readonly sql: SqlIngestionService,
    private readonly rules: CustomRulesService,
    private readonly policies: PoliciesService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (this.db) {
      this.nestLogger.log('ClinicalAuditsService using Postgres (drizzle) storage.');
    } else {
      this.nestLogger.warn(
        'ClinicalAuditsService running with IN-MEMORY store (no DATABASE_URL). Entries are lost on restart.',
      );
    }
  }

  async list(integratorId: string): Promise<AuditSummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(auditsTable)
        .where(eq(auditsTable.integratorId, integratorId))
        .orderBy(desc(auditsTable.createdAt));
      return rows.map(rowToSummary);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).map(memToSummary);
  }

  async get(integratorId: string, id: string): Promise<AuditSummary | null> {
    const r = await this.findInternal(integratorId, id);
    return r ? memToSummary(r) : null;
  }

  async create(
    integratorId: string,
    dto: AuditCreateDto,
    createdBy?: string,
  ): Promise<AuditSummary> {
    validateThreshold(dto.threshold);
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: MemRow = {
      id,
      integratorId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      connectionId: dto.connectionId.trim(),
      namedQueryId: dto.namedQueryId.trim(),
      queryParams: dto.queryParams ?? {},
      customRuleIds: dto.customRuleIds ?? [],
      policyIds: dto.policyIds ?? [],
      threshold: dto.threshold,
      channelIds: dto.channelIds ?? [],
      enabled: dto.enabled !== false,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (this.db) {
      await this.db.insert(auditsTable).values({
        id,
        integratorId,
        name: row.name,
        description: row.description ?? null,
        connectionId: row.connectionId,
        namedQueryId: row.namedQueryId,
        queryParams: row.queryParams,
        customRuleIds: row.customRuleIds,
        policyIds: row.policyIds,
        threshold: row.threshold,
        channelIds: row.channelIds,
        enabled: row.enabled,
        createdBy,
      });
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      arr.unshift(row);
      this.memByIntegrator.set(integratorId, arr);
    }
    return memToSummary(row);
  }

  async update(integratorId: string, id: string, dto: AuditUpdateDto): Promise<AuditSummary> {
    const existing = await this.findInternal(integratorId, id);
    if (!existing) throw new NotFoundException(`Audit not found: ${id}`);
    if (dto.threshold) validateThreshold(dto.threshold);
    const now = new Date().toISOString();
    const merged: MemRow = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      description:
        dto.description === null ? null : dto.description?.trim() ?? existing.description,
      queryParams: dto.queryParams ?? existing.queryParams,
      customRuleIds: dto.customRuleIds ?? existing.customRuleIds,
      policyIds: dto.policyIds ?? existing.policyIds,
      threshold: dto.threshold ?? existing.threshold,
      channelIds: dto.channelIds ?? existing.channelIds,
      enabled: dto.enabled ?? existing.enabled,
      updatedAt: now,
    };

    if (this.db) {
      await this.db
        .update(auditsTable)
        .set({
          name: merged.name,
          description: merged.description ?? null,
          queryParams: merged.queryParams,
          customRuleIds: merged.customRuleIds,
          policyIds: merged.policyIds,
          threshold: merged.threshold,
          channelIds: merged.channelIds,
          enabled: merged.enabled,
          updatedAt: new Date(),
        })
        .where(and(eq(auditsTable.integratorId, integratorId), eq(auditsTable.id, id)));
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr[idx] = merged;
    }
    return memToSummary(merged);
  }

  async remove(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      await this.db
        .delete(auditsTable)
        .where(and(eq(auditsTable.integratorId, integratorId), eq(auditsTable.id, id)));
      return true;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  /**
   * On-demand audit execution.
   *
   * Returns the full structured result regardless of threshold (the
   * developer sees every row's verdict). Channel dispatch only happens
   * when the threshold trips.
   */
  async runAudit(integratorId: string, id: string): Promise<AuditRunResult> {
    const audit = await this.findInternal(integratorId, id);
    if (!audit) throw new NotFoundException(`Audit not found: ${id}`);
    if (!audit.enabled) {
      return emptyResult(id, 'Audit is disabled.');
    }

    let rows: Array<Record<string, unknown>>;
    let mapping: QueryMapping;
    try {
      const fetched = await this.sql.fetchRows(
        audit.connectionId,
        audit.namedQueryId,
        audit.queryParams,
      );
      rows = fetched.rows;
      mapping = fetched.mapping;
    } catch (err) {
      return emptyResult(id, err instanceof Error ? err.message : 'Query failed.');
    }

    const verdicts: AuditRowVerdict[] = [];
    for (let i = 0; i < rows.length; i++) {
      const signals = rowToSignals(rows[i], mapping);
      // CustomRulesService.evaluate already returns only the rules
      // that matched. The audit's customRuleIds is an allow-list — we
      // count a row as "breaching" only if the matched rule is in it.
      const evaluation = await this.rules.evaluate(integratorId, signals);
      const breached = evaluation
        .filter((e) => audit.customRuleIds.includes(e.rule.id))
        .map((e) => e.rule.id);
      if (!breached.length) continue;

      // Cite policy sections for the verdict. Pulls top-3 relevant
      // sections per the existing policy retriever; integrator-scoped.
      const policyHits = await this.policies.findRelevant(integratorId, {
        medications: signals.medications,
        diagnoses: signals.diagnoses,
        allergies: signals.allergies,
      });
      verdicts.push({
        rowIndex: i,
        breachedRuleIds: breached,
        policyCitations: policyHits
          .filter((p) => audit.policyIds.length === 0 || audit.policyIds.includes(p.policyId))
          .slice(0, 3)
          .map((p) => ({
            policyId: p.policyId,
            sectionTitle: p.sectionTitle,
            snippet: p.snippet,
          })),
      });
    }

    const totalRows = rows.length;
    const breachedRows = verdicts.length;
    const breachPct = totalRows === 0 ? 0 : (breachedRows / totalRows) * 100;
    const thresholdBreached = isOverThreshold(audit.threshold, breachedRows, breachPct);

    let dispatches: AuditDispatchOutcome[] = [];
    if (thresholdBreached && audit.channelIds.length) {
      const body = renderAlertBody(audit, totalRows, breachedRows, breachPct, verdicts);
      dispatches = await Promise.all(
        audit.channelIds.map(async (channelId) => {
          const result = await this.notifications.send(integratorId, {
            channelId,
            body,
          });
          return {
            channelId,
            status: result.status ?? (result.ok ? 'sent' : 'failed'),
            ok: result.ok,
            error: result.error,
          };
        }),
      );
    }

    await this.touchLastRun(integratorId, id);

    return {
      auditId: id,
      ranAt: new Date().toISOString(),
      totalRows,
      breachedRows,
      breachPct,
      thresholdBreached,
      verdicts,
      dispatches,
    };
  }

  private async findInternal(integratorId: string, id: string): Promise<MemRow | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(auditsTable)
        .where(and(eq(auditsTable.integratorId, integratorId), eq(auditsTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      return rowToMem(rows[0]);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).find((r) => r.id === id) ?? null;
  }

  private async touchLastRun(integratorId: string, id: string): Promise<void> {
    if (this.db) {
      await this.db
        .update(auditsTable)
        .set({ lastRunAt: new Date() })
        .where(and(eq(auditsTable.integratorId, integratorId), eq(auditsTable.id, id)));
      return;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const row = arr.find((r) => r.id === id);
    if (row) row.lastRunAt = new Date().toISOString();
  }
}

function validateThreshold(t: AuditThreshold): void {
  if (t.kind !== 'absolute' && t.kind !== 'percentage') {
    throw new Error("threshold.kind must be 'absolute' or 'percentage'.");
  }
  if (typeof t.value !== 'number' || t.value < 0) {
    throw new Error('threshold.value must be a non-negative number.');
  }
  if (t.kind === 'percentage' && t.value > 100) {
    throw new Error('percentage threshold cannot exceed 100.');
  }
}

function isOverThreshold(t: AuditThreshold, count: number, pct: number): boolean {
  return t.kind === 'absolute' ? count >= t.value : pct >= t.value;
}

/** Per-row mapping for audit evaluation (single-patient-per-row model). */
function rowToSignals(
  row: Record<string, unknown>,
  mapping: QueryMapping,
): {
  medications?: string[];
  diagnoses?: string[];
  allergies?: string[];
  patient?: { ageYears?: number; pregnant?: boolean; eGFR?: number };
  labs?: Array<{ name?: string; code?: string; value: number | string; unit?: string }>;
} {
  const signals: ReturnType<typeof rowToSignals> = {};
  if (mapping.medicationColumn && row[mapping.medicationColumn] != null) {
    signals.medications = [String(row[mapping.medicationColumn])];
  }
  if (mapping.diagnosisColumn && row[mapping.diagnosisColumn] != null) {
    signals.diagnoses = [String(row[mapping.diagnosisColumn])];
  }
  if (mapping.allergyColumn && row[mapping.allergyColumn] != null) {
    signals.allergies = [String(row[mapping.allergyColumn])];
  }
  if (mapping.patient) {
    const p: NonNullable<ReturnType<typeof rowToSignals>['patient']> = {};
    for (const [field, col] of Object.entries(mapping.patient)) {
      const v = row[col];
      if (v == null) continue;
      if (field === 'pregnant') {
        p.pregnant =
          v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === 'yes';
      } else if (field === 'ageYears' || field === 'eGFR') {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n)) (p as Record<string, number>)[field] = n;
      }
    }
    if (Object.keys(p).length) signals.patient = p;
  }
  if (mapping.lab?.valueColumn && row[mapping.lab.valueColumn] != null) {
    const raw = row[mapping.lab.valueColumn];
    const num = typeof raw === 'number' ? raw : Number(raw);
    signals.labs = [
      {
        name: mapping.lab.nameColumn ? String(row[mapping.lab.nameColumn] ?? '') : undefined,
        code: mapping.lab.codeColumn ? String(row[mapping.lab.codeColumn] ?? '') : undefined,
        value: Number.isNaN(num) ? String(raw) : num,
        unit: mapping.lab.unitColumn ? String(row[mapping.lab.unitColumn] ?? '') : undefined,
      },
    ];
  }
  return signals;
}

function renderAlertBody(
  audit: MemRow,
  totalRows: number,
  breachedRows: number,
  breachPct: number,
  verdicts: AuditRowVerdict[],
): string {
  // Aggregate the breached rule IDs so the alert body explains WHY the
  // threshold tripped, without disclosing any patient-level content.
  const ruleCounts = new Map<string, number>();
  for (const v of verdicts) for (const r of v.breachedRuleIds) {
    ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
  }
  const topRules = [...ruleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `  - ${id}: ${n} row(s)`)
    .join('\n');
  const policyHits = new Set<string>();
  for (const v of verdicts) for (const c of v.policyCitations) policyHits.add(c.policyId);
  const policyLine = policyHits.size
    ? `\nCited policies: ${[...policyHits].join(', ')}`
    : '';
  return (
    `Subject: VedaMD audit alert — ${audit.name}\n\n` +
    `Audit "${audit.name}" tripped its threshold.\n` +
    `  Total rows examined: ${totalRows}\n` +
    `  Breaching rows:      ${breachedRows} (${breachPct.toFixed(1)}%)\n` +
    `  Threshold:           ${audit.threshold.kind} ${audit.threshold.value}\n\n` +
    `Top breaching rules:\n${topRules || '  (none)'}` +
    policyLine +
    `\n\nThis is a PHI-free summary. Open the VedaMD audit run for row-level verdicts (anonymous row indices only).`
  );
}

function emptyResult(id: string, error: string): AuditRunResult {
  return {
    auditId: id,
    ranAt: new Date().toISOString(),
    totalRows: 0,
    breachedRows: 0,
    breachPct: 0,
    thresholdBreached: false,
    verdicts: [],
    dispatches: [],
    error,
  };
}

function memToSummary(r: MemRow): AuditSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    connectionId: r.connectionId,
    namedQueryId: r.namedQueryId,
    customRuleIds: r.customRuleIds,
    policyIds: r.policyIds,
    channelIds: r.channelIds,
    threshold: r.threshold,
    enabled: r.enabled,
    createdAt: r.createdAt,
    lastRunAt: r.lastRunAt ?? null,
  };
}

function rowToSummary(r: typeof auditsTable.$inferSelect): AuditSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    connectionId: r.connectionId,
    namedQueryId: r.namedQueryId,
    customRuleIds: r.customRuleIds,
    policyIds: r.policyIds,
    channelIds: r.channelIds,
    threshold: r.threshold as AuditThreshold,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
  };
}

function rowToMem(r: typeof auditsTable.$inferSelect): MemRow {
  return {
    id: r.id,
    integratorId: r.integratorId,
    name: r.name,
    description: r.description,
    connectionId: r.connectionId,
    namedQueryId: r.namedQueryId,
    queryParams: (r.queryParams ?? {}) as Record<string, string | number>,
    customRuleIds: r.customRuleIds,
    policyIds: r.policyIds,
    threshold: r.threshold as AuditThreshold,
    channelIds: r.channelIds,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? undefined,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
  };
}
