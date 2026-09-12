import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { ContentFreshnessService } from '../src/modules/content-freshness/content-freshness.service';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { AppConfig } from '../src/config/configuration';

/**
 * The content-freshness audit is the platform's staleness safety net —
 * flagging clinical content whose citations are undated, missing, or older
 * than the review threshold — but shipped with zero test coverage. This
 * pins the classification logic directly against a scratch bundle
 * directory (no signing/manifest needed: the service reads the directory
 * straight off disk, bypassing KnowledgeService entirely).
 */

function makeService(bundleDir: string): ContentFreshnessService {
  const config = {
    get: (key: string) => (key === 'content.bundleDir' ? bundleDir : undefined),
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  return new ContentFreshnessService(config, log);
}

function writeFixture(dir: string, name: string, records: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(records));
}

describe('ContentFreshnessService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vedamd-freshness-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('flags a record whose newest reference year is exactly at the 5-year stale boundary', () => {
    const thisYear = new Date().getUTCFullYear();
    writeFixture(dir, 'drugs.json', [
      { slug: 'x', title: 'X', references: [{ label: `WHO ${thisYear - 5} guideline` }] },
    ]);
    const report = makeService(dir).runAudit();
    expect(report.byReason.stale).toBe(1);
    expect(report.topQueue[0].reason).toBe('stale');
    expect(report.topQueue[0].newestRefYear).toBe(thisYear - 5);
  });

  it('does NOT flag a record one year inside the boundary (4 years old)', () => {
    const thisYear = new Date().getUTCFullYear();
    writeFixture(dir, 'drugs.json', [
      { slug: 'x', title: 'X', references: [{ label: `WHO ${thisYear - 4} guideline` }] },
    ]);
    const report = makeService(dir).runAudit();
    expect(report.flagged).toBe(0);
  });

  it('flags "no-date" when references exist but none contain a parseable year', () => {
    writeFixture(dir, 'drugs.json', [
      { slug: 'x', title: 'X', references: [{ label: 'WHO Model Formulary' }] },
    ]);
    const report = makeService(dir).runAudit();
    expect(report.byReason['no-date']).toBe(1);
  });

  it('flags "no-refs" when references is missing or empty', () => {
    writeFixture(dir, 'drugs.json', [
      { slug: 'a', title: 'A' },
      { slug: 'b', title: 'B', references: [] },
    ]);
    const report = makeService(dir).runAudit();
    expect(report.byReason['no-refs']).toBe(2);
  });

  it('sorts the review queue no-refs before no-date before stale', () => {
    const thisYear = new Date().getUTCFullYear();
    writeFixture(dir, 'drugs.json', [
      { slug: 'stale', title: 'Stale', references: [{ label: `${thisYear - 10}` }] },
      { slug: 'norefs', title: 'NoRefs', references: [] },
      { slug: 'nodate', title: 'NoDate', references: [{ label: 'no year here' }] },
    ]);
    const report = makeService(dir).runAudit();
    expect(report.topQueue.map((r) => r.reason)).toEqual(['no-refs', 'no-date', 'stale']);
  });

  it('skips manifest.json and any file whose top level is not an array', () => {
    writeFixture(dir, 'manifest.json', [{ slug: 'ignored', references: [] }]);
    writeFileSync(join(dir, 'not-an-array.json'), JSON.stringify({ notAnArray: true }));
    const report = makeService(dir).runAudit();
    expect(report.scanned).toBe(0);
  });

  it('handles an unreadable bundle directory by returning an empty report, not throwing', () => {
    const report = makeService(join(dir, 'does-not-exist')).runAudit();
    expect(report.scanned).toBe(0);
    expect(report.flagged).toBe(0);
  });

  it('re-runs the audit on the weekly interval via onModuleInit', () => {
    vi.useFakeTimers();
    try {
      writeFixture(dir, 'drugs.json', [{ slug: 'x', title: 'X', references: [] }]);
      const svc = makeService(dir);
      svc.onModuleInit();
      expect(svc.get()?.flagged).toBe(1);

      // Change the fixture, then advance one week — the periodic re-scan
      // should pick up the change without another manual runAudit() call.
      writeFixture(dir, 'drugs.json', [{ slug: 'x', title: 'X', references: [{ label: '2026' }] }]);
      vi.advanceTimersByTime(7 * 24 * 3600 * 1000 + 1000);
      expect(svc.get()?.flagged).toBe(0);
      svc.onModuleDestroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
