import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { usageEvents, type UsageEventRow } from '../../db/schema';
import type { AppConfig } from '../../config/configuration';

export type UsageActorType = 'operator' | 'api_key' | 'anonymous';

export interface UsageRecordInput {
  integratorId: string | null;
  actorType: UsageActorType;
  /** Raw actor id (operator sub) — hashed before storage. */
  actorId?: string | null;
  /** Pre-hashed actor id (API key fingerprint is already an HMAC). */
  actorHash?: string | null;
  method: string;
  endpoint: string;
  category: string;
  statusCode: number;
  latencyMs: number;
  environment?: string | null;
}

export interface UsageSummary {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byEndpoint: Array<{ endpoint: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  byActorType: Array<{ actorType: string; count: number }>;
}

/**
 * Records and queries product-usage events. Writes are fire-and-forget
 * so the analytics path can never add latency to — or fail — a clinical
 * request. PHI-free: only route templates, categories, hashed actor ids
 * and timings are stored (see usage_events schema).
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly hashSecret: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle,
  ) {
    this.hashSecret = this.config.get('audit.hashSecret', { infer: true });
    if (!this.db) {
      this.logger.warn('UsageService running without DATABASE_URL — usage events are not recorded.');
    }
  }

  /** Fire-and-forget insert. Swallows all errors. */
  record(input: UsageRecordInput): void {
    if (!this.db) return;
    const actorHash = input.actorHash ?? (input.actorId ? this.hash(input.actorId) : null);
    void this.db
      .insert(usageEvents)
      .values({
        integratorId: input.integratorId,
        actorType: input.actorType,
        actorHash,
        method: input.method,
        endpoint: input.endpoint,
        category: input.category,
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        environment: input.environment ?? null,
      })
      .then(undefined, (err: unknown) => {
        this.logger.warn(
          `usage_record_failed: ${err instanceof Error ? err.name : 'unknown'}`,
        );
      });
  }

  /** Newest-first recent events for an integrator. */
  async query(
    integratorId: string,
    opts: { limit?: number; sinceMs?: number } = {},
  ): Promise<UsageEventRow[]> {
    if (!this.db) return [];
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const filters = [eq(usageEvents.integratorId, integratorId)];
    if (opts.sinceMs) filters.push(gte(usageEvents.occurredAt, new Date(opts.sinceMs)));
    return this.db
      .select()
      .from(usageEvents)
      .where(and(...filters))
      .orderBy(desc(usageEvents.occurredAt))
      .limit(limit);
  }

  /** Aggregated rollup for the usage dashboard. */
  async summary(integratorId: string, opts: { sinceMs?: number } = {}): Promise<UsageSummary> {
    const empty: UsageSummary = {
      total: 0,
      byCategory: [],
      byEndpoint: [],
      byDay: [],
      byActorType: [],
    };
    if (!this.db) return empty;
    const db = this.db;

    const filters = [eq(usageEvents.integratorId, integratorId)];
    if (opts.sinceMs) filters.push(gte(usageEvents.occurredAt, new Date(opts.sinceMs)));
    const where = and(...filters);

    const day = sql<string>`to_char(date_trunc('day', ${usageEvents.occurredAt}), 'YYYY-MM-DD')`;

    const [totalRow, byCategory, byEndpoint, byDay, byActorType] = await Promise.all([
      db.select({ c: count() }).from(usageEvents).where(where),
      db
        .select({ category: usageEvents.category, count: count() })
        .from(usageEvents)
        .where(where)
        .groupBy(usageEvents.category)
        .orderBy(desc(count())),
      db
        .select({ endpoint: usageEvents.endpoint, count: count() })
        .from(usageEvents)
        .where(where)
        .groupBy(usageEvents.endpoint)
        .orderBy(desc(count()))
        .limit(20),
      db.select({ day, count: count() }).from(usageEvents).where(where).groupBy(day).orderBy(day),
      db
        .select({ actorType: usageEvents.actorType, count: count() })
        .from(usageEvents)
        .where(where)
        .groupBy(usageEvents.actorType)
        .orderBy(desc(count())),
    ]);

    return {
      total: Number(totalRow[0]?.c ?? 0),
      byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
      byEndpoint: byEndpoint.map((r) => ({ endpoint: r.endpoint, count: Number(r.count) })),
      byDay: byDay.map((r) => ({ day: r.day, count: Number(r.count) })),
      byActorType: byActorType.map((r) => ({ actorType: r.actorType, count: Number(r.count) })),
    };
  }

  private hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }
}
