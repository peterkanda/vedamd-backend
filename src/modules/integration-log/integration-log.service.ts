import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTEGRATION_LOG_ALLOWED_KEYS,
  type IntegrationLogEntry,
} from './integration-log.types';
import type { AppConfig } from '../../config/configuration';

interface IntegratorBuffer {
  ring: IntegrationLogEntry[];
  head: number;
  size: number;
}

/**
 * In-memory bounded ring buffer per integrator (FR-330 to FR-343).
 *
 * v0.1: in-process implementation suitable for single-instance dev
 * and unit testing of the field allow-list. Production replaces this
 * with a Postgres-backed implementation that preserves the same API
 * and the same allow-list enforcement at the DB column level.
 *
 * Three-layer enforcement:
 *   1. TypeScript type `IntegrationLogEntry` (compile-time)
 *   2. `INTEGRATION_LOG_ALLOWED_KEYS` runtime check in `record()` (this file)
 *   3. Postgres column constraints + check constraints (future)
 */
@Injectable()
export class IntegrationLogService {
  private readonly logger = new Logger(IntegrationLogService.name);
  private readonly buffers = new Map<string, IntegratorBuffer>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.maxEntries = this.config.get('integrationLog.maxEntriesPerIntegrator', { infer: true });
    this.ttlMs =
      this.config.get('integrationLog.ttlDays', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  /**
   * Append an entry to the integrator's ring buffer. Throws if the
   * entry contains any field outside the allow-list (FR-335).
   */
  record(integratorId: string, entry: IntegrationLogEntry): void {
    this.assertAllowedKeysOnly(entry as unknown as Record<string, unknown>);

    let buf = this.buffers.get(integratorId);
    if (!buf) {
      buf = { ring: new Array(this.maxEntries), head: 0, size: 0 };
      this.buffers.set(integratorId, buf);
    }

    buf.ring[buf.head] = entry;
    buf.head = (buf.head + 1) % this.maxEntries;
    if (buf.size < this.maxEntries) buf.size += 1;
  }

  /**
   * Query an integrator's buffer. Newest-first. TTL-based eviction
   * runs lazily on read (FR-332).
   */
  query(
    integratorId: string,
    filter: { limit?: number; sinceMs?: number } = {},
  ): IntegrationLogEntry[] {
    const buf = this.buffers.get(integratorId);
    if (!buf || buf.size === 0) return [];

    const cutoffMs = Date.now() - this.ttlMs;
    const sinceMs = filter.sinceMs ?? 0;
    const limit = Math.min(filter.limit ?? 50, 500);

    const out: IntegrationLogEntry[] = [];
    // Iterate newest-first.
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
