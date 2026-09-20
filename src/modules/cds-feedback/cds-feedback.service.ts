import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { cdsCardFeedback } from '../../db/schema';
import { CdsService } from '../cds/cds.service';
import type {
  CdsFeedbackEntry,
  CdsFeedbackModelReport,
  CdsFeedbackModelSummary,
  CdsFeedbackPagedRow,
  CdsFeedbackRequest,
  CdsFeedbackRuleSummary,
} from './cds-feedback.types';

/** Rule id the agentic engine registers its LLM cards under. */
const AGENTIC_RULE_ID = 'agentic-reasoner';

/**
 * Feedback entries a model needs before its rates are compared with another
 * model's. Below this a handful of clicks swings the override rate by tens of
 * points, so a "change" would be noise.
 */
export const MODEL_COMPARISON_MIN_SAMPLE = 30;

interface StoredRow {
  id: string;
  cardUuid: string;
  ruleId: string | null;
  serviceId: string;
  hook: string;
  outcome: 'accepted' | 'overridden';
  overrideReasonCode: string | null;
  overrideReasonDisplay: string | null;
  userComment: string | null;
  modelId: string | null;
  indicator: string | null;
  acceptReasonCode: string | null;
  acceptReasonDisplay: string | null;
  createdAt: Date;
}

/**
 * CDS Hooks 1.0 §6 feedback ingest + per-rule aggregation.
 *
 * Anti-PHI invariants:
 *   - The card's clinical text is never persisted — we keep only the
 *     card UUID we minted, the rule + service + hook ids it came from,
 *     the model id and indicator, the outcome, and the reason codes.
 *   - User comments are length-capped at 280 chars and stripped of
 *     anything resembling an obvious patient identifier (digits run of
 *     ≥ 7, MRN/DOB markers). This is conservative — EMRs that need to
 *     pass detailed clinician feedback should send a separate audit
 *     trail outside CDS Hooks.
 *   - Storage is per-integrator; tenant B cannot see tenant A's
 *     feedback aggregations.
 */
@Injectable()
export class CdsFeedbackService {
  private readonly nestLogger = new Logger(CdsFeedbackService.name);
  private readonly memByIntegrator = new Map<string, StoredRow[]>();

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null,
    private readonly cds: CdsService,
  ) {}

  async ingest(
    integratorId: string,
    serviceId: string,
    body: CdsFeedbackRequest,
  ): Promise<{ accepted: number; rejected: number }> {
    if (!Array.isArray(body?.feedback)) return { accepted: 0, rejected: 0 };
    let accepted = 0;
    let rejected = 0;
    for (const entry of body.feedback) {
      const row = this.normalise(integratorId, serviceId, entry);
      if (!row) {
        rejected += 1;
        continue;
      }
      if (this.db) {
        await this.db.insert(cdsCardFeedback).values(row);
      } else {
        const list = this.memByIntegrator.get(integratorId) ?? [];
        list.push({ ...row, createdAt: new Date() });
        this.memByIntegrator.set(integratorId, list);
      }
      accepted += 1;
    }
    return { accepted, rejected };
  }

  async summaryByRule(integratorId: string): Promise<CdsFeedbackRuleSummary[]> {
    const rows = await this.allRows(integratorId);
    const byRule = new Map<string, StoredRow[]>();
    for (const r of rows) {
      const key = r.ruleId ?? '<unattributed>';
      const list = byRule.get(key) ?? [];
      list.push(r);
      byRule.set(key, list);
    }
    const out: CdsFeedbackRuleSummary[] = [];
    for (const [ruleId, list] of byRule) {
      const overridden = list.filter((r) => r.outcome === 'overridden').length;
      const accepted = list.filter((r) => r.outcome === 'accepted').length;
      const totalFeedback = list.length;
      out.push({
        ruleId: ruleId === '<unattributed>' ? null : ruleId,
        firstServiceId: list[0]?.serviceId ?? 'unknown',
        hook: list[0]?.hook ?? 'unknown',
        totalFeedback,
        accepted,
        overridden,
        overrideRatePct: pct(overridden, totalFeedback),
        topOverrideReasons: topReasons(list, 'overrideReasonCode', 'overrideReasonDisplay'),
        lastFeedbackAt: new Date(Math.max(...list.map((r) => r.createdAt.getTime()))).toISOString(),
      });
    }
    return out.sort((a, b) => b.totalFeedback - a.totalFeedback);
  }

  /**
   * Adoption of LLM cards per model, newest model first, plus a comparison
   * of the newest model with the previous one. Run after every model change:
   * a rising acceptance of critical AI cards, or a falling override rate with
   * no matching drop in reported errors, is the pattern to investigate.
   */
  async summaryByModel(integratorId: string): Promise<CdsFeedbackModelReport> {
    const rows = (await this.allRows(integratorId)).filter((r) => r.ruleId === AGENTIC_RULE_ID);
    const byModel = new Map<string, StoredRow[]>();
    for (const r of rows) {
      const key = r.modelId ?? 'unknown';
      const list = byModel.get(key) ?? [];
      list.push(r);
      byModel.set(key, list);
    }

    const models: CdsFeedbackModelSummary[] = [];
    for (const [modelId, list] of byModel) {
      const times = list.map((r) => r.createdAt.getTime());
      const critical = list.filter((r) => r.indicator === 'critical');
      const criticalAccepted = critical.filter((r) => r.outcome === 'accepted');
      const overridden = list.filter((r) => r.outcome === 'overridden').length;
      models.push({
        modelId,
        totalFeedback: list.length,
        accepted: list.length - overridden,
        overridden,
        overrideRatePct: pct(overridden, list.length),
        criticalFeedback: critical.length,
        criticalAccepted: criticalAccepted.length,
        criticalAcceptedWithoutReason: criticalAccepted.filter((r) => !r.acceptReasonCode).length,
        topOverrideReasons: topReasons(list, 'overrideReasonCode', 'overrideReasonDisplay'),
        topAcceptReasons: topReasons(list, 'acceptReasonCode', 'acceptReasonDisplay'),
        firstFeedbackAt: new Date(Math.min(...times)).toISOString(),
        lastFeedbackAt: new Date(Math.max(...times)).toISOString(),
        sufficientData: list.length >= MODEL_COMPARISON_MIN_SAMPLE,
      });
    }
    models.sort((a, b) => b.firstFeedbackAt.localeCompare(a.firstFeedbackAt));

    const [current, previous] = models;
    const comparison =
      current && previous
        ? {
            currentModelId: current.modelId,
            previousModelId: previous.modelId,
            overrideRateDeltaPct: current.overrideRatePct - previous.overrideRatePct,
            criticalAcceptRateDeltaPct:
              current.criticalFeedback > 0 && previous.criticalFeedback > 0
                ? pct(current.criticalAccepted, current.criticalFeedback) -
                  pct(previous.criticalAccepted, previous.criticalFeedback)
                : null,
            comparable: current.sufficientData && previous.sufficientData,
          }
        : null;

    return { minSample: MODEL_COMPARISON_MIN_SAMPLE, models, comparison };
  }

  async listByRule(
    integratorId: string,
    ruleId: string | null,
    limit = 50,
  ): Promise<CdsFeedbackPagedRow[]> {
    const rows = await this.allRows(integratorId);
    return rows
      .filter((r) => (ruleId === null ? r.ruleId === null : r.ruleId === ruleId))
      .slice(0, limit)
      .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  private async allRows(integratorId: string): Promise<StoredRow[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(cdsCardFeedback)
        .where(eq(cdsCardFeedback.integratorId, integratorId))
        .orderBy(desc(cdsCardFeedback.createdAt));
      return rows.map((r) => ({
        id: r.id,
        cardUuid: r.cardUuid,
        ruleId: r.ruleId,
        serviceId: r.serviceId,
        hook: r.hook,
        outcome: r.outcome as 'accepted' | 'overridden',
        overrideReasonCode: r.overrideReasonCode,
        overrideReasonDisplay: r.overrideReasonDisplay,
        userComment: r.userComment,
        modelId: r.modelId,
        indicator: r.indicator,
        acceptReasonCode: r.acceptReasonCode,
        acceptReasonDisplay: r.acceptReasonDisplay,
        createdAt: r.createdAt,
      }));
    }
    return (this.memByIntegrator.get(integratorId) ?? []).slice().reverse();
  }

  private normalise(
    integratorId: string,
    serviceId: string,
    entry: CdsFeedbackEntry,
  ): (Omit<StoredRow, 'createdAt'> & { integratorId: string }) | null {
    if (!entry || typeof entry.card !== 'string') return null;
    if (entry.outcome !== 'accepted' && entry.outcome !== 'overridden') return null;
    const lookup = this.cds.lookupCard(entry.card);
    // We accept feedback even if the lookup expired (e.g. EMR replayed
    // overnight). We just lose rule attribution — still useful as a
    // total-volume signal.
    const ruleId = lookup?.ruleId ?? null;
    const hook = lookup?.hook ?? 'unknown';
    // Reason fields follow the outcome, so an accepted entry can't carry an
    // override reason into the override statistics (or vice versa).
    const reason = entry.outcome === 'overridden' ? entry.overrideReason : entry.acceptReason;
    const rawComment = reason?.userComment ?? null;
    return {
      id: randomUUID(),
      integratorId,
      cardUuid: entry.card,
      ruleId,
      serviceId,
      hook,
      outcome: entry.outcome,
      overrideReasonCode: entry.outcome === 'overridden' ? (reason?.reason?.code ?? null) : null,
      overrideReasonDisplay:
        entry.outcome === 'overridden' ? (reason?.reason?.display ?? null) : null,
      acceptReasonCode: entry.outcome === 'accepted' ? (reason?.reason?.code ?? null) : null,
      acceptReasonDisplay: entry.outcome === 'accepted' ? (reason?.reason?.display ?? null) : null,
      userComment: rawComment ? scrubComment(rawComment) : null,
      modelId: lookup?.model ?? null,
      indicator: lookup?.indicator ?? null,
    };
  }
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/** Top 3 reason codes in descending frequency. */
function topReasons(
  rows: StoredRow[],
  codeField: 'overrideReasonCode' | 'acceptReasonCode',
  displayField: 'overrideReasonDisplay' | 'acceptReasonDisplay',
): Array<{ code: string; display?: string; count: number }> {
  const counts = new Map<string, { code: string; display?: string; count: number }>();
  for (const r of rows) {
    const code = r[codeField];
    if (!code) continue;
    const existing = counts.get(code);
    if (existing) existing.count += 1;
    else counts.set(code, { code, display: r[displayField] ?? undefined, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
}

/**
 * Strip the most obvious patient-identifier-shaped substrings before
 * persisting a clinician's free-text comment. Best-effort: the EMR
 * should not be sending PHI here in the first place; this is a defence
 * in depth. Length-capped at 280 chars (one tweet).
 */
function scrubComment(raw: string): string {
  const trimmed = raw.slice(0, 280);
  return (
    trimmed
      // 7+ consecutive digits (MRN, NHS/SSN-like, phone) → [digits]
      .replace(/\d{7,}/g, '[digits]')
      // ISO-ish date 1900-2100 → [date]
      .replace(/\b(19|20)\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g, '[date]')
      // Bare 8-digit DDMMYYYY/YYYYMMDD → [date]
      .replace(/\b\d{8}\b/g, '[date]')
  );
}
