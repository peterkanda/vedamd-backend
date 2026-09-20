import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DOMAIN_TIER, GovernanceService } from '../src/modules/governance/governance.service';
import type { ReadinessReport } from '../src/modules/governance/governance.types';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * GET /v1/governance/readiness — the release gate for approved-only serving.
 * It must tell the truth about the shipped bundle: all-draft content and
 * known-wrong drug codes are blockers, not warnings.
 */

const BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');
let svc: GovernanceService;
let report: ReadinessReport;

beforeAll(() => {
  svc = new GovernanceService(makeKnowledgeService());
  report = svc.readiness();
});

const check = (id: string) => report.checks.find((c) => c.id === id)!;

describe('release readiness — shipped dev bundle', () => {
  it('is not release-ready, and says why', () => {
    expect(report.releaseReady).toBe(false);
    expect(check('content-approval').status).toBe('block');
    expect(check('drug-codes').status).toBe('block');
    expect(report.blockers).toHaveLength(report.checks.filter((c) => c.status === 'block').length);
  });

  it('reports every check exactly once', () => {
    expect(report.checks.map((c) => c.id).sort()).toEqual(
      [
        'approved-only-mode',
        'citation-urls',
        'corrections',
        'content-approval',
        'country-overlays',
        'drug-codes',
        'fr024',
        'manufacturer-labels',
        'per-kg-ceilings',
      ].sort(),
    );
  });

  it('counts the quarantined RxNorm codes from the audit', () => {
    const q = JSON.parse(
      readFileSync(resolve(process.cwd(), 'content/safety/rxnorm-quarantine.json'), 'utf8'),
    );
    expect(check('drug-codes').metrics.quarantinedRxNorm).toBe(q.codes.length);
  });

  it('orders domains by clinical-risk tier and assigns every domain a tier explicitly', () => {
    const tiers = report.domains.map((d) => d.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    for (const d of report.domains) expect(DOMAIN_TIER[d.domain]).toBeDefined();
  });
});

describe('governance coverage', () => {
  it('counts every reviewable record in the bundle (no domain left out)', () => {
    let expected = 0;
    for (const f of readdirSync(BUNDLE)) {
      if (!f.endsWith('.json') || f === 'manifest.json') continue;
      const parsed = JSON.parse(readFileSync(join(BUNDLE, f), 'utf8'));
      if (Array.isArray(parsed)) expected += parsed.filter((r) => r?.reviewStatus).length;
    }
    expect(svc.report().totals.records).toBe(expected);
  });
});

describe('per-kg dose screen', () => {
  it('matches scripts/check-clinical-safety.js category B exactly', () => {
    const out = execFileSync('node', ['scripts/check-clinical-safety.js'], { encoding: 'utf8' });
    const scriptCount = Number(
      /^B\. Per-kg DOSE without an explicit max.*: (\d+)$/m.exec(out)?.[1],
    );
    expect(Number.isFinite(scriptCount)).toBe(true);
    expect(check('per-kg-ceilings').metrics.records).toBe(scriptCount);
  });
});

describe('country overlays', () => {
  it('counts only overlays explicitly signed off', () => {
    const dir = mkdtempSync(join(tmpdir(), 'overlays-'));
    try {
      for (const [cc, signedOff] of [
        ['UG', true],
        ['TZ', false],
      ] as const) {
        mkdirSync(join(dir, cc));
        writeFileSync(join(dir, cc, 'overlay.json'), JSON.stringify({ country: cc, signedOff }));
      }
      mkdirSync(join(dir, '_base'));
      const c = svc.readiness(dir).checks.find((x) => x.id === 'country-overlays')!;
      expect(c.metrics).toEqual({ countries: 2, signedOff: 1 });
      expect(c.status).toBe('warn');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
