import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { deviceAnswerEvents } from '../../db/schema';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import type { AppConfig } from '../../config/configuration';
import {
  DEVICE_ANSWER_ALLOWED_KEYS,
  MAX_REPORTS_PER_SYNC,
  type DeviceAnswerReport,
} from './device-audit.types';

export interface SyncOutcome {
  accepted: number;
  rejected: number;
}

/** Caps so one client cannot write unbounded strings into the ledger. */
const MAX_FIELD_CHARS = 200;
const MAX_SOURCE_IDS = 12;

@Injectable()
export class DeviceAuditService {
  private readonly logger = new Logger(DeviceAuditService.name);
  private readonly hashSecret: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle,
  ) {
    this.hashSecret = this.config.get('audit.hashSecret', { infer: true });
    if (!this.db) {
      this.logger.warn(
        'DeviceAuditService running without DB; on-device answer reports go to the PHI-free log only.',
      );
    }
  }

  /**
   * Accept a batch of on-device answer reports for one clinician.
   *
   * Malformed reports are counted and dropped rather than failing the batch:
   * a phone that has been offline for a week should be able to hand over the
   * records it does have, and losing the whole batch to one bad row would lose
   * exactly the history an incident review needs.
   */
  async sync(clinicianId: string, reports: DeviceAnswerReport[]): Promise<SyncOutcome> {
    const actorHash = this.hash(clinicianId);
    const batch = reports.slice(0, MAX_REPORTS_PER_SYNC);
    let rejected = reports.length - batch.length;

    const rows = [];
    for (const raw of batch) {
      const row = this.normalise(actorHash, raw);
      if (!row) {
        rejected += 1;
        continue;
      }
      rows.push(row);
    }

    // Always emit to the PHI-free log, so the trail survives even with no DB.
    for (const row of rows) {
      this.log.info('device_answer', {
        actor_hash: row.actorHash,
        event: row.refused ? 'device_answer_refused' : 'device_answer',
        llm_model: row.modelVersion ?? undefined,
        llm_provider: row.engine,
        latency_ms: row.latencyMs ?? undefined,
        timestamp: row.occurredAt.toISOString(),
      });
    }

    if (this.db && rows.length > 0) {
      // A retried sync must not duplicate rows; clientEventId is unique.
      await this.db.insert(deviceAnswerEvents).values(rows).onConflictDoNothing();
    }

    return { accepted: rows.length, rejected };
  }

  /** Validate + clamp one report. Returns null when it cannot be trusted. */
  private normalise(actorHash: string, raw: DeviceAnswerReport) {
    for (const key of Object.keys(raw)) {
      if (!(DEVICE_ANSWER_ALLOWED_KEYS as readonly string[]).includes(key)) {
        // An unexpected key means a client is sending something this contract
        // never agreed to carry — reject rather than store part of it.
        return null;
      }
    }

    const clientEventId = str(raw.clientEventId);
    const questionHash = str(raw.questionHash);
    const engine = str(raw.engine);
    if (!clientEventId || !questionHash || !engine) return null;

    const occurredAt = new Date(raw.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return null;

    if (
      typeof raw.grounded !== 'boolean' ||
      typeof raw.refused !== 'boolean' ||
      typeof raw.complete !== 'boolean'
    ) {
      return null;
    }

    return {
      clientEventId,
      occurredAt,
      actorHash,
      questionHash,
      engine,
      modelVersion: str(raw.modelVersion) || null,
      contentVersion: str(raw.contentVersion) || null,
      grounded: raw.grounded,
      refused: raw.refused,
      complete: raw.complete,
      sourceIds: (raw.sourceIds ?? [])
        .slice(0, MAX_SOURCE_IDS)
        .map((s) => str(s))
        .filter(Boolean),
      latencyMs: Number.isFinite(raw.latencyMs) ? Math.max(0, Math.round(raw.latencyMs!)) : null,
      appVersion: str(raw.appVersion) || null,
    };
  }

  private hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_FIELD_CHARS) : '';
}
