import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, lt, count, sql } from 'drizzle-orm';
import {
  INTEGRATION_LOG_ALLOWED_KEYS,
  type IntegrationLogEntry,
} from './integration-log.types';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { integrationLog } from '../../db/schema';
import type { AppConfig } from '../../config/configuration';

interface IntegratorBuffer {
  ring: IntegrationLogEntry[];
  head: number;
  size: number;
}

/**
 * Bounded integration log (FR-330 to FR-343).
 *
 * Two backends:
 *   - DATABASE_URL set → Postgres-backed. Each integrator's rows are
 *     bounded by the same SRS ceilings (maxEntries per integrator,
 *     ttlDays). TTL eviction runs lazily on read and as a soft cap on
 *     write.
 *   - DATABASE_URL absent → in-process ring buffer. Used by unit
 *     tests and dev runs.
 *
 * Three-layer field enforcement:
 *   1. TypeScript type IntegrationLogEntry (compile-time)
 *   2. INTEGRATION_LOG_ALLOWED_KEYS runtime check in record()
 *   3. Postgres column set (no JSONB blob)
 */
@Injectable()
export class IntegrationLogService {
  private readonly logger = new Logger(IntegrationLogService.name);
  private readonly memoryBuffers = new Map<string, IntegratorBuffer>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle,
  ) {
    this.maxEntries = this.config.get('integrationLog.maxEntriesPerIntegrator', { infer: true });
    this.ttlMs =
      this.config.get('integrationLog.ttlDays', { infer: true }) * 24 * 60 * 60 * 1000;
    if (!this.db) {
      this.logger.warn(
        'IntegrationLogService running with IN-MEMORY ring buffer (no DATABASE_URL). Entries lost on restart.',
      );
    }
  }

  /**
   * Append an entry. Throws if any field is outside the FR-335 allow-list.
   */
  async record(integratorId: string, entry: IntegrationLogEntry): Promise<void> {
    this.assertAllowedKeysOnly(entry as unknown as Record<string, unknown>);

    if (this.db) {
      // ON CONFLICT DO NOTHING: request_id is the primary key, so a
      // replayed request is idempotent.
      await this.db
        .insert(integrationLog)
        .values({
          requestId: entry.request_id,
          integratorId,
          timestamp: new Date(entry.timestamp),
          environment: entry.environment,
          apiKeyFingerprint: entry.api_key_fingerprint,
          endpoint: entry.endpoint,
          hook: entry.hook,
          latencyMs: entry.latency_ms,
          statusCode: entry.status_code,
          errorCategory: entry.error_category,
          cardsReturnedCount: entry.cards_returned_count,
          cardSummaries: entry.card_summaries,
          citations: entry.citations,
          rulesEvaluated: entry.rules_evaluated,
          llmInvoked: entry.llm_invoked,
          llmProvider: entry.llm_provider,
          overrideReported: entry.override_reported,
          overrideReasonCode: entry.override_reason_code,
        })
        .onConflictDoNothing();

      // Probabilistic cap enforcement so hot writers don't all pay.
      if (Math.random() < 0.01) {
        await this.enforceCap(integratorId);
      }
      return;
    }

    let buf = this.memoryBuffers.get(integratorId);
    if (!buf) {
      buf = { ring: new Array(this.maxEntries), head: 0, size: 0 };
      this.memoryBuffers.set(integratorId, buf);
    }
    buf.ring[buf.head] = entry;
    buf.head = (buf.head + 1) % this.maxEntries;
    if (buf.size < this.maxEntries) buf.size += 1;
  }

  /**
   * Query an integrator's log. Newest-first. TTL filter applied.
   */
  async query(
    integratorId: string,
    filter: { limit?: number; sinceMs?: number } = {},
  ): Promise<IntegrationLogEntry[]> {
    const cutoffMs = Date.now() - this.ttlMs;
    const sinceMs = filter.sinceMs ?? 0;
    const limit = Math.min(filter.limit ?? 50, 500);

    if (this.db) {
      const lowerBound = new Date(Math.max(cutoffMs, sinceMs));
      const rows = await this.db
        .select()
        .from(integrationLog)
        .where(
          and(
            eq(integrationLog.integratorId, integratorId),
            gte(integrationLog.timestamp, lowerBound),
          ),
        )
        .orderBy(desc(integrationLog.timestamp))
        .limit(limit);
      return rows.map(rowToEntry);
    }

    const buf = this.memoryBuffers.get(integratorId);
    if (!buf || buf.size === 0) return [];
    const out: IntegrationLogEntry[] = [];
    for (let i = 0; i < buf.size && out.length < limit; i += 1) {
      const idx = (buf.head - 1 - i + this.maxEntries) % this.maxEntries;
      const e = buf.ring[idx];
      if (!e) continue;
      const t = Date.parse(e.timestamp);
      if (Number.isNaN(t) || t < cutoffMs || t < sinceMs) continue;
      out.push(e);
    }
    return out;
  }

  private async enforceCap(integratorId: string): Promise<void> {
    if (!this.db) return;
    try {
      // 1. Delete TTL-expired rows.
      const cutoff = new Date(Date.now() - this.ttlMs);
      await this.db
        .delete(integrationLog)
        .where(
          and(eq(integrationLog.integratorId, integratorId), lt(integrationLog.timestamp, cutoff)),
        );

      // 2. Enforce per-integrator ceiling.
      const totalRow = await this.db
        .select({ value: count() })
        .from(integrationLog)
        .where(eq(integrationLog.integratorId, integratorId));
      const total = Number(totalRow[0]?.value ?? 0);
      if (total > this.maxEntries) {
        const overflow = total - this.maxEntries;
        await this.db.execute(
          sql`DELETE FROM ${integrationLog}
              WHERE request_id IN (
                SELECT request_id FROM ${integrationLog}
                WHERE integrator_id = ${integratorId}
                ORDER BY timestamp ASC
                LIMIT ${overflow}
              )`,
        );
      }
    } catch (e) {
      this.logger.warn(`enforceCap failed for ${integratorId}: ${(e as Error).message}`);
    }
  }

  private assertAllowedKeysOnly(entry: Record<string, unknown>): void {
    for (const key of Object.keys(entry)) {
      if (!INTEGRATION_LOG_ALLOWED_KEYS.includes(key as (typeof INTEGRATION_LOG_ALLOWED_KEYS)[number])) {
        const message = `Integration Log: field '${key}' is not on the allow-list (FR-333/FR-335).`;
        this.logger.error(message);
        throw new Error(message);
      }
    }
  }
}

function rowToEntry(r: typeof integrationLog.$inferSelect): IntegrationLogEntry {
  return {
    request_id: r.requestId,
    timestamp: r.timestamp.toISOString(),
    environment: r.environment as IntegrationLogEntry['environment'],
    api_key_fingerprint: r.apiKeyFingerprint,
    endpoint: r.endpoint,
    hook: (r.hook ?? undefined) as IntegrationLogEntry['hook'],
    latency_ms: r.latencyMs,
    status_code: r.statusCode,
    error_category: r.errorCategory as IntegrationLogEntry['error_category'],
    rules_evaluated: r.rulesEvaluated as IntegrationLogEntry['rules_evaluated'],
    cards_returned_count: r.cardsReturnedCount,
    card_summaries: r.cardSummaries,
    citations: r.citations as IntegrationLogEntry['citations'],
    llm_invoked: r.llmInvoked,
    llm_provider: r.llmProvider as IntegrationLogEntry['llm_provider'],
    override_reported: r.overrideReported,
    override_reason_code: r.overrideReasonCode ?? undefined,
  };
}
