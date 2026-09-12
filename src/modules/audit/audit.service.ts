import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { desc, sql } from 'drizzle-orm';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { auditEvents } from '../../db/schema';
import type { AppConfig } from '../../config/configuration';

/**
 * Advisory-lock key serialising audit appends. Any value works as long as it
 * is stable and unique to this purpose across the deployment.
 */
const AUDIT_CHAIN_LOCK = 4_820_260_911;

export type AuditEventType =
  | 'cds.evaluated'
  | 'cds.override_reported'
  // Clinician-facing chat surfaces. The column is plain text, so extending
  // this union needs no migration.
  | 'assistant.chat'
  | 'reference.chat'
  | 'auth.login'
  | 'auth.token_issued'
  | 'auth.token_revoked'
  | 'api_key.created'
  | 'api_key.rotated'
  | 'api_key.revoked'
  | 'bundle.published'
  | 'bundle.signed';

/**
 * Compliance-grade audit event. All identifier-bearing fields must be
 * passed through `actorId` / `subjectId`; the wrapper hashes them
 * (NFR-029, FR-123). Anything else must come from the allow-list.
 */
export interface AuditEvent {
  type: AuditEventType;
  tenantId?: string;
  /** Operator/integrator identifier. Hashed before write. */
  actorId?: string;
  /** Optional secondary identifier. Hashed before write. Patient IDs MUST never be passed in plaintext. */
  subjectId?: string;
  ruleId?: string;
  ruleVersion?: string;
  endpoint?: string;
  statusCode?: number;
  latencyMs?: number;
  overrideReasonCode?: string;
  /** Hashed correlation id (already hashed by caller). */
  requestId?: string;
  occurredAt?: string;
}

/**
 * Append-only audit ledger (SRS §6.3.7 — FR-120–127).
 *
 * Backends:
 *   - DATABASE_URL set → audit_events Postgres table with HMAC chain
 *     (each row's hmac is HMAC(secret, canonical(content + prev_hmac))).
 *     Auditors can verify any prefix of the log is intact by recomputing
 *     the chain.
 *   - DATABASE_URL absent → emit to PHI-free Pino logger only (existing
 *     behaviour). The chain is not built without storage.
 *
 * The PHI-free Pino emission ALWAYS runs in both modes — losing the
 * append-only DB doesn't lose the audit trail entirely.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly hashSecret: string;

  constructor(
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle,
  ) {
    this.hashSecret = this.config.get('audit.hashSecret', { infer: true });
    if (!this.db) {
      this.logger.warn(
        'AuditService running without DB; events go to PHI-free log only (no HMAC chain).',
      );
    }
  }

  async record(event: AuditEvent): Promise<void> {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

    // 1. PHI-free structured log — always.
    this.log.info('audit', {
      event: event.type,
      tenant_id: event.tenantId,
      ...(event.actorId ? { actor_id: event.actorId } : {}),
      ...(event.subjectId ? { subject_id: event.subjectId } : {}),
      ...(event.ruleId ? { rule_id: event.ruleId } : {}),
      ...(event.ruleVersion ? { rule_version: event.ruleVersion } : {}),
      ...(event.endpoint ? { endpoint: event.endpoint } : {}),
      ...(event.statusCode !== undefined ? { status_code: event.statusCode } : {}),
      ...(event.latencyMs !== undefined ? { latency_ms: event.latencyMs } : {}),
      ...(event.overrideReasonCode
        ? { override_reported: true, override_reason_code: event.overrideReasonCode }
        : {}),
      ...(event.requestId ? { request_id: event.requestId } : {}),
      timestamp: occurredAt.toISOString(),
    });

    // 2. Persistent append-only ledger with HMAC chain.
    if (!this.db) return;
    try {
      const actorHash = event.actorId ? this.hashIdentifier(event.actorId) : null;
      const subjectHash = event.subjectId ? this.hashIdentifier(event.subjectId) : null;

      /*
       * Read the chain tail and append inside one transaction, behind a
       * Postgres advisory lock.
       *
       * The tail used to be cached in-process, which is correct for a single
       * instance and silently wrong for two: each replica would chain onto its
       * own last write, producing forks that `verifyChain()` reports as
       * tampering at the first interleave. An audit ledger that cannot be
       * verified is not an audit ledger, so this pays one extra query per
       * append to keep the chain linear. The write is already off the response
       * path, so the cost is not user-visible.
       */
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

        const prevRows = await tx
          .select({ hmac: auditEvents.hmac })
          .from(auditEvents)
          .orderBy(desc(auditEvents.id))
          .limit(1);
        const prevHmac = prevRows[0]?.hmac ?? null;

        const content = {
          occurredAt: occurredAt.toISOString(),
          eventType: event.type,
          tenantId: event.tenantId ?? null,
          actorHash,
          subjectHash,
          ruleId: event.ruleId ?? null,
          ruleVersion: event.ruleVersion ?? null,
          endpoint: event.endpoint ?? null,
          statusCode: event.statusCode ?? null,
          latencyMs: event.latencyMs ?? null,
          overrideReasonCode: event.overrideReasonCode ?? null,
          requestId: event.requestId ?? null,
          prevHmac,
        };

        await tx
          .insert(auditEvents)
          .values({
            occurredAt,
            eventType: event.type,
            tenantId: event.tenantId,
            actorHash,
            subjectHash,
            ruleId: event.ruleId,
            ruleVersion: event.ruleVersion,
            endpoint: event.endpoint,
            statusCode: event.statusCode,
            latencyMs: event.latencyMs,
            overrideReasonCode: event.overrideReasonCode,
            requestId: event.requestId,
            prevHmac,
            hmac: this.computeHmac(content),
          })
          .returning({ hmac: auditEvents.hmac });
      });
    } catch (e) {
      this.logger.error(`audit insert failed: ${(e as Error).message}`);
    }
  }

  /**
   * Recompute the HMAC chain over the existing rows and assert every
   * row's stored hmac matches the recomputed one. Returns the first
   * row index where the chain breaks, or null if intact. Auditors run
   * this to verify the ledger has not been altered.
   */
  async verifyChain(): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
    if (!this.db) return { ok: true };
    const rows = await this.db.select().from(auditEvents).orderBy(auditEvents.id);
    let prev: string | null = null;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const content = {
        occurredAt: r.occurredAt.toISOString(),
        eventType: r.eventType,
        tenantId: r.tenantId ?? null,
        actorHash: r.actorHash ?? null,
        subjectHash: r.subjectHash ?? null,
        ruleId: r.ruleId ?? null,
        ruleVersion: r.ruleVersion ?? null,
        endpoint: r.endpoint ?? null,
        statusCode: r.statusCode ?? null,
        latencyMs: r.latencyMs ?? null,
        overrideReasonCode: r.overrideReasonCode ?? null,
        requestId: r.requestId ?? null,
        prevHmac: r.prevHmac ?? null,
      };
      const expected = this.computeHmac(content);
      if (r.hmac !== expected) return { ok: false, brokenAt: i };
      if ((r.prevHmac ?? null) !== prev) return { ok: false, brokenAt: i };
      prev = r.hmac;
    }
    return { ok: true };
  }

  private hashIdentifier(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }

  private computeHmac(content: Record<string, unknown>): string {
    return createHmac('sha256', this.hashSecret).update(canonicalJson(content)).digest('hex');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}
