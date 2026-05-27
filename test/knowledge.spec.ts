import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadBundleFromDisk } from '../src/modules/knowledge/bundle-loader';
import { makeKnowledgeService } from './helpers/knowledge';

const REAL_BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');

function copyBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedamd-bundle-'));
  for (const f of [
    'manifest.json',
    'manifest.sig',
    'public-key.pem',
    'conditions.json',
    'drugs.json',
    'drug-interactions.json',
    'procedures.json',
    'cds-rules.json',
    'clinical-scores.json',
    'pharmacogenomics.json',
    'drug-disease-interactions.json',
    'immunization-schedule.json',
    'allergy-cross-reactivity.json',
    'notifiable-diseases.json',
    'reference-ranges.json',
    'antidotes.json',
    'toxidromes.json',
    'anticoagulant-reversal.json',
    'iv-compatibility.json',
    'pregnancy-lactation.json',
  ]) {
    copyFileSync(resolve(REAL_BUNDLE, f), resolve(dir, f));
  }
  return dir;
}

describe('bundle loader — happy path', () => {
  it('loads, verifies, and parses the dev bundle', () => {
    const b = loadBundleFromDisk(REAL_BUNDLE, { strict: true });
    expect(b.info.verified).toBe(true);
    expect(b.info.verificationStatus).toBe('ok');
    expect(b.conditions.length).toBeGreaterThan(0);
    expect(b.drugs.length).toBeGreaterThan(0);
    expect(b.interactions.length).toBeGreaterThan(0);
    expect(b.procedures.length).toBeGreaterThan(0);
  });
});

describe('bundle loader — tamper detection', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = copyBundle();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('detects modification of a content file via SHA-256 mismatch', () => {
    const path = resolve(tmp, 'conditions.json');
    const orig = readFileSync(path);
    writeFileSync(path, orig.toString('utf8') + '\n');
    expect(() => loadBundleFromDisk(tmp, { strict: true })).toThrow(/hash-mismatch/);
  });

  it('detects modification of the manifest via signature mismatch', () => {
    const path = resolve(tmp, 'manifest.json');
    const m = JSON.parse(readFileSync(path, 'utf8'));
    m.signedBy = 'attacker';
    writeFileSync(path, JSON.stringify(m, null, 2) + '\n');
    expect(() => loadBundleFromDisk(tmp, { strict: true })).toThrow(/signature-invalid/);
  });

  it('detects a missing signature file', () => {
    rmSync(resolve(tmp, 'manifest.sig'));
    expect(() => loadBundleFromDisk(tmp, { strict: true })).toThrow(/signature-invalid/);
  });

  it('returns empty content in non-strict mode for a missing bundle', () => {
    const empty = mkdtempSync(join(tmpdir(), 'vedamd-empty-'));
    const b = loadBundleFromDisk(empty, { strict: false });
    expect(b.info.verified).toBe(false);
    expect(b.info.verificationStatus).toBe('missing');
    expect(b.conditions.length).toBe(0);
    rmSync(empty, { recursive: true, force: true });
  });

  it('rejects a bundle where the manifest is missing a required file', () => {
    const path = resolve(tmp, 'manifest.json');
    const m = JSON.parse(readFileSync(path, 'utf8'));
    m.files = m.files.filter((f: { name: string }) => f.name !== 'conditions.json');
    writeFileSync(path, JSON.stringify(m, null, 2) + '\n');
    expect(() => loadBundleFromDisk(tmp, { strict: true })).toThrow(/signature-invalid/);
    // (Signature fails first because we edited the manifest; that is the
    // correct order — signature gates everything else.)
  });
});

describe('KnowledgeService', () => {
  it('reports bundle info via getInfo() including content stats', () => {
    const ks = makeKnowledgeService();
    const info = ks.getInfo();
    expect(info.verified).toBe(true);
    expect(info.version).toBe('v0.1.0');
    expect(info.signedBy).toBe('vedamd-dev-key-v0');
    expect(info.files.length).toBe(18);
    expect(info.contentStats).toBeDefined();
    expect(info.contentStats!.totalRecords).toBeGreaterThan(0);
    expect(info.contentStats!.byStatus.draft).toBeGreaterThan(0);
    expect(info.contentStats!.byStatus.approved).toBe(0);
  });

  it('exposes every domain via its getter', () => {
    const ks = makeKnowledgeService();
    expect(ks.getConditions().length).toBeGreaterThan(0);
    expect(ks.getDrugs().length).toBeGreaterThan(0);
    expect(ks.getInteractions().length).toBeGreaterThan(0);
    expect(ks.getProcedures().length).toBeGreaterThan(0);
  });

  it('refuses to load the all-draft bundle when requireApproved is true (strict)', () => {
    expect(() => makeKnowledgeService({ requireApproved: true, strict: true })).toThrow(
      /non-approved-content/,
    );
  });

  it('returns empty content with non-approved status in non-strict approved-required mode', () => {
    const ks = makeKnowledgeService({ requireApproved: true, strict: false });
    expect(ks.getInfo().verificationStatus).toBe('non-approved-content');
    expect(ks.getInfo().verified).toBe(false);
    expect(ks.getConditions().length).toBe(0);
    expect(ks.getDrugs().length).toBe(0);
  });
});

// Avoid the unused-import warning when running a partial test selection.
void mkdirSync;
