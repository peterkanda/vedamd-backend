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
 * Public, anonymous-by-construction product metrics — safe to show on the
 * marketing landing page and to share externally. All counts are
 * k-anonymised: tenant and actor counts under 5 are reported as null, and
 * counts under 100 are rounded to the nearest 10 (everything else to the
 * nearest 100) so a sparse early-pilot deployment can't be reverse-mapped
 * to specific sites or users.
 */
export interface PublicMetrics {
  /** Total API requests served in the rolling window. */
  apiRequests30d: number;
  /** Distinct hashed actors (operator + API key fingerprint). null if <5. */
  activeUsers30d: number | null;
  /** Distinct integrators (tenants). null if <5. */
  activeOrgs30d: number | null;
  /** Successful CDS evaluations served. */
  cdsEvaluations30d: number;
  /** Window definition for transparency. */
  windowDays: number;
  generatedAt: string;
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

  /**
   * Cross-tenant aggregated metrics for the public showcase. Tenant-blind:
   * does not filter by integrator. Counts are rounded for privacy.
   *
   * RLS posture: this query is intentionally NOT tenant-scoped — it sums
   * across all integrators to produce showcase numbers. The route that
   * exposes it is unauthenticated AND the numbers are bucketed to
   * thwart small-N inference. No row content is returned.
   */
  async publicMetrics(windowDays = 30): Promise<PublicMetrics> {
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();
    const empty: PublicMetrics = {
      apiRequests30d: 0,
      activeUsers30d: null,
      activeOrgs30d: null,
      cdsEvaluations30d: 0,
      windowDays,
      generatedAt,
    };
    if (!this.db) return empty;
    const since = new Date(now - windowDays * 24 * 3600 * 1000);

    const [totalRow, usersRow, orgsRow, cdsRow] = await Promise.all([
      this.db
        .select({ c: count() })
        .from(usageEvents)
        .where(gte(usageEvents.occurredAt, since)),
      this.db
        .select({ c: sql<number>`count(distinct ${usageEvents.actorHash})` })
        .from(usageEvents)
        .where(gte(usageEvents.occurredAt, since)),
      this.db
        .select({ c: sql<number>`count(distinct ${usageEvents.integratorId})` })
        .from(usageEvents)
        .where(gte(usageEvents.occurredAt, since)),
      this.db
        .select({ c: count() })
        .from(usageEvents)
        .where(
          and(
            gte(usageEvents.occurredAt, since),
            eq(usageEvents.category, 'cds'),
            sql`${usageEvents.statusCode} < 400`,
          ),
        ),
    ]);

    return {
      apiRequests30d: roundForPublic(Number(totalRow[0]?.c ?? 0)),
      activeUsers30d: kAnon(Number(usersRow[0]?.c ?? 0)),
      activeOrgs30d: kAnon(Number(orgsRow[0]?.c ?? 0)),
      cdsEvaluations30d: roundForPublic(Number(cdsRow[0]?.c ?? 0)),
      windowDays,
      generatedAt,
    };
  }

  private hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }
}

/** k-anonymity: don't expose counts under the k=5 threshold. */
function kAnon(n: number): number | null {
  if (n < 5) return null;
  return roundForPublic(n);
}

/** Round to nearest 10 below 100, nearest 100 below 1,000, nearest 1,000 above. */
function roundForPublic(n: number): number {
  if (n < 10) return n;
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 1_000) return Math.round(n / 100) * 100;
  return Math.round(n / 1_000) * 1_000;
}
