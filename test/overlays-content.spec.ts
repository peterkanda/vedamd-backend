import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHostIndex, sourceForUrl } from '../src/modules/localization/source-registry';

/**
 * Overlay-content safety invariants (mirror of scripts/validate-overlays.ts).
 *
 * Draft country / WHO-baseline overlay content lives outside the signed bundle
 * and is promoted only after clinical review. These tests lock the invariants
 * that make that safe: jurisdiction-tagged, never self-approved, cited, and
 * licence-compliant.
 */

const OVERLAYS = resolve(process.cwd(), 'content/overlays');
const SUPPORTED = new Set(['WHO', 'KE', 'UG', 'TZ', 'RW', 'ET', 'NG', 'GH', 'ZA', 'ZM', 'MW']);

interface OverlayRecord {
  slug?: string;
  jurisdiction?: string;
  reviewStatus?: string;
  references?: Array<{ url?: string; strength?: string; licence?: string }>;
}

function overlayContentFiles(): string[] {
  const files: string[] = [];
  const base = resolve(OVERLAYS, '_base');
  if (existsSync(base))
    for (const f of readdirSync(base)) if (f.endsWith('.json')) files.push(resolve(base, f));
  for (const entry of readdirSync(OVERLAYS)) {
    const dir = resolve(OVERLAYS, entry, 'records');
    if (existsSync(dir) && statSync(dir).isDirectory())
      for (const f of readdirSync(dir)) if (f.endsWith('.json')) files.push(resolve(dir, f));
  }
  return files;
}

function allRecords(): OverlayRecord[] {
  return overlayContentFiles().flatMap((f) => {
    const parsed = JSON.parse(readFileSync(f, 'utf8'));
    return Array.isArray(parsed) ? parsed : [parsed];
  });
}

describe('overlay content', () => {
  const records = allRecords();
  const hostIndex = buildHostIndex();

  it('every overlay record is jurisdiction-tagged and never self-approved', () => {
    const bad = records.filter(
      (r) =>
        !r.jurisdiction ||
        !SUPPORTED.has(r.jurisdiction) ||
        (r.reviewStatus !== 'draft' && r.reviewStatus !== 'review'),
    );
    expect(bad.map((r) => r.slug)).toEqual([]);
  });

  it('every overlay record carries a licence-compliant graded citation', () => {
    const bad: string[] = [];
    for (const r of records) {
      if (!r.references?.length) bad.push(`${r.slug}: no citation`);
      for (const ref of r.references ?? []) {
        if (!['A', 'B', 'C', 'D'].includes(ref.strength as string)) bad.push(`${r.slug}: strength`);
        if (ref.url && ref.licence) {
          const src = sourceForUrl(ref.url, hostIndex);
          if (src && ref.licence !== src.citationLicence) bad.push(`${r.slug}: licence mismatch`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('seeds the WHO-baseline AWaRe classification (draft)', () => {
    const aware = records.find((r) => r.slug === 'who-aware-classification-2023') as
      | (OverlayRecord & { classification?: Record<string, string[]> })
      | undefined;
    expect(aware).toBeTruthy();
    expect(aware!.jurisdiction).toBe('WHO');
    expect(aware!.reviewStatus).toBe('draft');
    expect(aware!.classification?.Access?.length).toBeGreaterThan(0);
    expect(aware!.classification?.Watch?.length).toBeGreaterThan(0);
    expect(aware!.classification?.Reserve?.length).toBeGreaterThan(0);
    // WHO source is cite-only — must be flagged cc-by-nc-sa, not reusable.
    expect(aware!.references?.[0]?.licence).toBe('cc-by-nc-sa');
  });
});
