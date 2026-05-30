import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import type { AppConfig } from '../../config/configuration';
import type { FreshnessRecord, FreshnessReport } from './content-freshness.types';

const WEEK_MS = 7 * 24 * 3600 * 1000;
const STALE_AFTER_YEARS = 5;
const TOP_QUEUE_LIMIT = 200;

/**
 * Weekly content-freshness audit.
 *
 * Scans every record in the signed bundle and flags those whose newest
 * referenced source predates the staleness threshold (or carries no
 * date at all). The resulting report is exposed via GET
 * /v1/content-freshness and acts as the content team's review backlog
 * — the system never silently overwrites clinical content; it surfaces
 * what to re-verify against WHO / BNF / specialty-society updates.
 *
 * Pure scheduled audit — no outbound network calls (anti-PHI posture +
 * deterministic). Re-runs on boot and every 7 days via a single
 * setInterval (no new schedule dependency added).
 */
@Injectable()
export class ContentFreshnessService implements OnModuleInit, OnModuleDestroy {
  private readonly nestLogger = new Logger(ContentFreshnessService.name);
  private currentReport: FreshnessReport | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {}

  onModuleInit(): void {
    this.runAudit();
    this.timer = setInterval(() => this.runAudit(), WEEK_MS);
    // Don't keep the event loop alive just for the freshness timer —
    // it's a maintenance side-channel.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Latest report, or null if not yet generated. */
  get(): FreshnessReport | null {
    return this.currentReport;
  }

  /** Force a re-run; used by tests and the dev-portal manual trigger. */
  runAudit(): FreshnessReport {
    const bundleDir = this.config.get('content.bundleDir', { infer: true });
    const currentYear = new Date().getUTCFullYear();
    const queue: FreshnessRecord[] = [];
    const byFile: Record<string, number> = {};
    const byReason: Record<'stale' | 'no-date' | 'no-refs', number> = {
      stale: 0,
      'no-date': 0,
      'no-refs': 0,
    };
    let scanned = 0;

    let files: string[];
    try {
      files = readdirSync(bundleDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
    } catch (e) {
      this.nestLogger.warn(
        `Cannot read bundle dir "${bundleDir}" — freshness audit skipped: ${(e as Error).message}`,
      );
      return (this.currentReport = emptyReport());
    }

    for (const file of files) {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(bundleDir, file), 'utf8'));
      } catch {
        continue;
      }
      if (!Array.isArray(data)) continue;
      for (const rec of data) {
        if (!isRecord(rec)) continue;
        scanned += 1;
        const flagged = classifyRecord(rec, currentYear);
        if (!flagged) continue;
        queue.push({
          source: file,
          slug: stringOr(rec.slug, stringOr(rec.id, 'unknown')),
          title: stringOr(rec.title, stringOr(rec.inn, stringOr(rec.name, '?'))),
          newestRefYear: flagged.newestRefYear,
          reason: flagged.reason,
        });
        byFile[file] = (byFile[file] ?? 0) + 1;
        byReason[flagged.reason] += 1;
      }
    }

    // Sort: oldest stale first, then no-date, then no-refs.
    queue.sort((a, b) => {
      const sevA = severity(a);
      const sevB = severity(b);
      if (sevA !== sevB) return sevB - sevA;
      return (a.newestRefYear ?? 0) - (b.newestRefYear ?? 0);
    });

    this.currentReport = {
      generatedAt: new Date().toISOString(),
      staleAfterYears: STALE_AFTER_YEARS,
      scanned,
      flagged: queue.length,
      byFile,
      byReason,
      topQueue: queue.slice(0, TOP_QUEUE_LIMIT),
    };

    // Use the framework logger (not the PHI-free logger) — this is a
    // boot/maintenance event with non-PHI counts that aren't on the
    // PHI-free allow-list.
    this.nestLogger.log(
      `Content freshness audit: ${scanned} scanned, ${queue.length} flagged ` +
        `(stale=${byReason.stale}, no-date=${byReason['no-date']}, no-refs=${byReason['no-refs']}).`,
    );
    return this.currentReport;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function emptyReport(): FreshnessReport {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterYears: STALE_AFTER_YEARS,
    scanned: 0,
    flagged: 0,
    byFile: {},
    byReason: { stale: 0, 'no-date': 0, 'no-refs': 0 },
    topQueue: [],
  };
}

function severity(r: FreshnessRecord): number {
  // Higher = surface earlier on the review queue.
  if (r.reason === 'no-refs') return 3;
  if (r.reason === 'no-date') return 2;
  return 1;
}

const YEAR_RE = /\b(19|20)\d{2}\b/g;
function newestYearIn(value: string): number | null {
  let best: number | null = null;
  const matches = value.match(YEAR_RE);
  if (!matches) return null;
  for (const m of matches) {
    const y = Number(m);
    if (!Number.isFinite(y)) continue;
    if (best === null || y > best) best = y;
  }
  return best;
}

function classifyRecord(
  rec: Record<string, unknown>,
  currentYear: number,
): { reason: 'stale' | 'no-date' | 'no-refs'; newestRefYear: number | null } | null {
  const refs = Array.isArray(rec.references) ? rec.references : null;
  if (!refs || refs.length === 0) {
    return { reason: 'no-refs', newestRefYear: null };
  }
  let newest: number | null = null;
  for (const r of refs) {
    if (!isRecord(r)) continue;
    const label = typeof r.label === 'string' ? r.label : '';
    const url = typeof r.url === 'string' ? r.url : '';
    const y = Math.max(newestYearIn(label) ?? -Infinity, newestYearIn(url) ?? -Infinity);
    if (Number.isFinite(y) && (newest === null || y > newest)) newest = y;
  }
  if (newest === null) return { reason: 'no-date', newestRefYear: null };
  if (currentYear - newest >= STALE_AFTER_YEARS) {
    return { reason: 'stale', newestRefYear: newest };
  }
  return null;
}
