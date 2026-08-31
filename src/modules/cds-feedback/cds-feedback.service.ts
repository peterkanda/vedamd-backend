import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { cdsCardFeedback } from '../../db/schema';
import { CdsService } from '../cds/cds.service';
import type {
  CdsFeedbackEntry,
  CdsFeedbackPagedRow,
  CdsFeedbackRequest,
  CdsFeedbackRuleSummary,
} from './cds-feedback.types';

/**
 * CDS Hooks 1.0 §6 feedback ingest + per-rule aggregation.
 *
 * Anti-PHI invariants:
 *   - The card's clinical text is never persisted — we keep only the
 *     card UUID we minted, the rule + service + hook ids it came from,
 *     the outcome, and the override-reason code/display.
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
  private readonly memByIntegrator = new Map<
    string,
    Array<{
      id: string;
      cardUuid: string;
      ruleId: string | null;
      serviceId: string;
      hook: string;
      outcome: 'accepted' | 'overridden';
      overrideReasonCode: string | null;
      overrideReasonDisplay: string | null;
      userComment: string | null;
      createdAt: Date;
    }>
  >();

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
        list.push({
          id: row.id,
          cardUuid: row.cardUuid,
          ruleId: row.ruleId ?? null,
          serviceId: row.serviceId,
          hook: row.hook,
          outcome: row.outcome as 'accepted' | 'overridden',
          overrideReasonCode: row.overrideReasonCode ?? null,
          overrideReasonDisplay: row.overrideReasonDisplay ?? null,
          userComment: row.userComment ?? null,
          createdAt: new Date(),
        });
        this.memByIntegrator.set(integratorId, list);
      }
      accepted += 1;
    }
    return { accepted, rejected };
  }

  async summaryByRule(integratorId: string): Promise<CdsFeedbackRuleSummary[]> {
    const rows = await this.allRows(integratorId);
    const byRule = new Map<string, typeof rows>();
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
      const reasonCounts = new Map<string, { code: string; display?: string; count: number }>();
      for (const r of list) {
        if (!r.overrideReasonCode) continue;
        const existing = reasonCounts.get(r.overrideReasonCode);
        if (existing) existing.count += 1;
        else
          reasonCounts.set(r.overrideReasonCode, {
            code: r.overrideReasonCode,
            display: r.overrideReasonDisplay ?? undefined,
            count: 1,
          });
      }
      const topOverrideReasons = [...reasonCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      out.push({
        ruleId: ruleId === '<unattributed>' ? null : ruleId,
        firstServiceId: list[0]?.serviceId ?? 'unknown',
        hook: list[0]?.hook ?? 'unknown',
        totalFeedback,
        accepted,
        overridden,
        overrideRatePct: totalFeedback === 0 ? 0 : (overridden / totalFeedback) * 100,
        topOverrideReasons,
        lastFeedbackAt: new Date(Math.max(...list.map((r) => r.createdAt.getTime()))).toISOString(),
      });
    }
    return out.sort((a, b) => b.totalFeedback - a.totalFeedback);
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
      .map((r) => ({
        id: r.id,
        cardUuid: r.cardUuid,
        ruleId: r.ruleId,
        serviceId: r.serviceId,
        hook: r.hook,
        outcome: r.outcome,
        overrideReasonCode: r.overrideReasonCode,
        overrideReasonDisplay: r.overrideReasonDisplay,
        userComment: r.userComment,
        createdAt: r.createdAt.toISOString(),
      }));
  }

  private async allRows(integratorId: string): Promise<
    Array<{
      id: string;
      cardUuid: string;
      ruleId: string | null;
      serviceId: string;
      hook: string;
      outcome: 'accepted' | 'overridden';
      overrideReasonCode: string | null;
      overrideReasonDisplay: string | null;
      userComment: string | null;
      createdAt: Date;
    }>
  > {
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
        createdAt: r.createdAt,
      }));
    }
    return (this.memByIntegrator.get(integratorId) ?? []).slice().reverse();
  }

  private normalise(
    integratorId: string,
    serviceId: string,
    entry: CdsFeedbackEntry,
  ): {
    id: string;
    integratorId: string;
    cardUuid: string;
    ruleId: string | null;
    serviceId: string;
    hook: string;
    outcome: string;
    overrideReasonCode: string | null;
    overrideReasonDisplay: string | null;
    userComment: string | null;
  } | null {
    if (!entry || typeof entry.card !== 'string') return null;
    if (entry.outcome !== 'accepted' && entry.outcome !== 'overridden') return null;
    const lookup = this.cds.lookupCard(entry.card);
    // We accept feedback even if the lookup expired (e.g. EMR replayed
    // overnight). We just lose rule attribution — still useful as a
    // total-volume signal.
    const ruleId = lookup?.ruleId ?? null;
    const hook = lookup?.hook ?? 'unknown';
    const overrideReasonCode = entry.overrideReason?.reason?.code ?? null;
    const overrideReasonDisplay = entry.overrideReason?.reason?.display ?? null;
    const rawComment = entry.overrideReason?.userComment ?? null;
    const userComment = rawComment ? scrubComment(rawComment) : null;
    return {
      id: randomUUID(),
      integratorId,
      cardUuid: entry.card,
      ruleId,
      serviceId,
      hook,
      outcome: entry.outcome,
      overrideReasonCode,
      overrideReasonDisplay,
      userComment,
    };
  }
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
