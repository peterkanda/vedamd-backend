import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { apiKeys } from '../../db/schema';
import type { AppConfig } from '../../config/configuration';

export type ApiKeyScope =
  | 'cds:evaluate'
  | 'cds:discover'
  | 'content:read'
  | 'drug-info:read'
  | 'terminology:read'
  | 'bundles:read'
  | 'integration-log:read'
  | 'clinical-audit:run';

export type ApiKeyEnvironment = 'sandbox' | 'production';

export interface ApiKeyRecord {
  id: string;
  integratorId: string;
  name: string;
  fingerprint: string;
  scopes: ApiKeyScope[];
  environment: ApiKeyEnvironment;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

/**
 * How long a database lookup of a bearer key is reused. Every API-key request
 * used to wait on a SELECT against the (cross-region) database. A revoke
 * through this service drops the cached entry at once; a key revoked some
 * other way (SQL console, another instance) stops working within this window.
 */
const KEY_LOOKUP_TTL_MS = 60_000;
/** Unknown keys are remembered for less time, so garbage can't pin memory for long. */
const UNKNOWN_KEY_TTL_MS = 10_000;
/** Cap on remembered lookups; the oldest is dropped first. */
const MAX_CACHED_LOOKUPS = 5_000;
/** `last_used_at` is written at most this often per key. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export interface ApiKeyCreatedOnce extends ApiKeyRecord {
  /** Shown once at creation; never stored. */
  secret: string;
}

/**
 * API key registry (FR-313).
 *
 * Two backends, picked at boot:
 *   - DATABASE_URL set: Drizzle / Postgres (Supabase or any Postgres).
 *     The HMAC fingerprint is the stored secret; the raw key is shown
 *     once at creation and never persisted.
 *   - DATABASE_URL absent: in-process Map. Used by unit tests and
 *     standalone dev runs; data is lost on restart. The runtime logs
 *     a loud warning so this isn't mistaken for production.
 */
@Injectable()
export class ApiKeysService {
  private readonly nestLogger = new Logger(ApiKeysService.name);
  private readonly memoryById = new Map<string, ApiKeyRecord>();
  private readonly memoryByFingerprint = new Map<string, ApiKeyRecord>();
  /** Database lookups by fingerprint (see KEY_LOOKUP_TTL_MS). */
  private readonly lookups = new Map<string, { record: ApiKeyRecord | null; expires: number }>();
  /** When `last_used_at` was last written, by key id. */
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle,
  ) {
    if (!this.db) {
      this.nestLogger.warn(
        'ApiKeysService running with IN-MEMORY storage (no DATABASE_URL). Keys will not survive restart.',
      );
    }
  }

  async list(integratorId: string): Promise<ApiKeyRecord[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.integratorId, integratorId));
      return rows.map(rowToRecord);
    }
    return [...this.memoryById.values()].filter((k) => k.integratorId === integratorId);
  }

  async create(input: {
    integratorId: string;
    name: string;
    scopes: ApiKeyScope[];
    environment: ApiKeyEnvironment;
  }): Promise<ApiKeyCreatedOnce> {
    const id = randomBytes(8).toString('hex');
    const secret = `vmd_${input.environment === 'production' ? 'live' : 'test'}_${randomBytes(24).toString('base64url')}`;
    const fingerprint = this.fingerprint(secret);
    const createdAt = new Date();

    const record: ApiKeyRecord = {
      id,
      integratorId: input.integratorId,
      name: input.name,
      fingerprint,
      scopes: input.scopes,
      environment: input.environment,
      createdAt: createdAt.toISOString(),
    };

    if (this.db) {
      await this.db.insert(apiKeys).values({
        id,
        integratorId: input.integratorId,
        name: input.name,
        fingerprint,
        scopes: input.scopes,
        environment: input.environment,
        createdAt,
      });
    } else {
      this.memoryById.set(id, record);
      this.memoryByFingerprint.set(fingerprint, record);
    }

    return { ...record, secret };
  }

  /**
   * Atomic rotation: revoke the old key and issue a new secret for the
   * same logical key (preserves name + scopes + environment). Returns
   * the new key (secret shown once) plus the revoked old record. If the
   * old key id doesn't belong to this integrator, returns null.
   */
  async rotate(
    integratorId: string,
    id: string,
  ): Promise<{ revoked: ApiKeyRecord; created: ApiKeyCreatedOnce } | null> {
    const existing = await this.findById(integratorId, id);
    if (!existing) return null;
    if (existing.revokedAt) return null;

    const revoked = await this.revoke(integratorId, id);
    if (!revoked) return null;
    const created = await this.create({
      integratorId,
      name: existing.name,
      scopes: existing.scopes,
      environment: existing.environment,
    });
    return { revoked, created };
  }

  private async findById(integratorId: string, id: string): Promise<ApiKeyRecord | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.integratorId, integratorId)))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    const k = this.memoryById.get(id);
    return k && k.integratorId === integratorId ? k : null;
  }

  async revoke(integratorId: string, id: string): Promise<ApiKeyRecord | null> {
    const revokedAt = new Date();
    if (this.db) {
      const rows = await this.db
        .update(apiKeys)
        .set({ revokedAt })
        .where(and(eq(apiKeys.id, id), eq(apiKeys.integratorId, integratorId)))
        .returning();
      if (rows[0]) this.lookups.delete(rows[0].fingerprint);
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    const k = this.memoryById.get(id);
    if (!k || k.integratorId !== integratorId) return null;
    const updated: ApiKeyRecord = { ...k, revokedAt: revokedAt.toISOString() };
    this.memoryById.set(id, updated);
    this.memoryByFingerprint.set(updated.fingerprint, updated);
    return updated;
  }

  /**
   * Validate a bearer token. Returns the matching record on success,
   * null on any failure (missing, malformed, unknown, revoked).
   *
   * The fingerprint comparison is constant-time to deny any leak
   * about which keys exist server-side.
   */
  async validateBearer(token: string | undefined): Promise<ApiKeyRecord | null> {
    if (!token || !token.startsWith('vmd_')) return null;
    const fingerprint = this.fingerprint(token);

    let candidate: ApiKeyRecord | undefined;
    if (this.db) {
      candidate = (await this.lookupActive(fingerprint)) ?? undefined;
    } else {
      const k = this.memoryByFingerprint.get(fingerprint);
      candidate = k && !k.revokedAt ? k : undefined;
    }
    if (!candidate) return null;

    const a = Buffer.from(candidate.fingerprint, 'hex');
    const b = Buffer.from(fingerprint, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return candidate;
  }

  /** The active (unrevoked) key with this fingerprint, from cache or the database. */
  private async lookupActive(fingerprint: string): Promise<ApiKeyRecord | null> {
    const now = Date.now();
    const cached = this.lookups.get(fingerprint);
    if (cached && cached.expires > now) return cached.record;

    const rows = await this.db!.select()
      .from(apiKeys)
      .where(and(eq(apiKeys.fingerprint, fingerprint), isNull(apiKeys.revokedAt)))
      .limit(1);
    const record = rows[0] ? rowToRecord(rows[0]) : null;

    this.lookups.delete(fingerprint);
    if (this.lookups.size >= MAX_CACHED_LOOKUPS) {
      this.lookups.delete(this.lookups.keys().next().value!);
    }
    this.lookups.set(fingerprint, {
      record,
      expires: now + (record ? KEY_LOOKUP_TTL_MS : UNKNOWN_KEY_TTL_MS),
    });
    return record;
  }

  /**
   * Record usage. Best-effort; failure is logged but not surfaced. With a
   * database, writes at most once per LAST_USED_WRITE_INTERVAL_MS per key —
   * an UPDATE on every request cost a pool connection for a timestamp that
   * only needs minute precision.
   */
  async recordUsage(id: string, when: Date = new Date()): Promise<void> {
    try {
      if (this.db) {
        const last = this.lastUsedWrites.get(id);
        if (last !== undefined && when.getTime() - last < LAST_USED_WRITE_INTERVAL_MS) return;
        if (this.lastUsedWrites.size >= MAX_CACHED_LOOKUPS) this.lastUsedWrites.clear();
        this.lastUsedWrites.set(id, when.getTime());
        await this.db.update(apiKeys).set({ lastUsedAt: when }).where(eq(apiKeys.id, id));
        return;
      }
      const k = this.memoryById.get(id);
      if (!k) return;
      const updated: ApiKeyRecord = { ...k, lastUsedAt: when.toISOString() };
      this.memoryById.set(id, updated);
      this.memoryByFingerprint.set(updated.fingerprint, updated);
    } catch (e) {
      this.nestLogger.warn(`recordUsage failed for ${id}: ${(e as Error).message}`);
    }
  }

  private fingerprint(secret: string): string {
    const hmacKey = this.config.get('apiKeys.fingerprintSecret', { infer: true });
    return createHmac('sha256', hmacKey).update(secret).digest('hex');
  }
}

function rowToRecord(r: typeof apiKeys.$inferSelect): ApiKeyRecord {
  return {
    id: r.id,
    integratorId: r.integratorId,
    name: r.name,
    fingerprint: r.fingerprint,
    scopes: r.scopes as ApiKeyScope[],
    environment: r.environment as ApiKeyEnvironment,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString(),
    revokedAt: r.revokedAt?.toISOString(),
  };
}
