import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL_BUNDLE = resolve(process.cwd(), 'content/bundles/v0.1.0');
const SCRIPT = resolve(process.cwd(), 'scripts/verify-bundle.ts');

function run(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('npx', ['--yes', 'ts-node', '--transpile-only', SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? 1,
      stdout: (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? ''),
    };
  }
}

function copyBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vedamd-verify-'));
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
  ]) {
    copyFileSync(resolve(REAL_BUNDLE, f), resolve(dir, f));
  }
  return dir;
}

describe('scripts/verify-bundle.ts', () => {
  it('exits 0 on the committed dev bundle without --require-approved', () => {
    const r = run(['--bundle', REAL_BUNDLE]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('verified');
    expect(r.stdout).toContain('non-approved record');
  });

  it('exits 3 on the committed dev bundle with --require-approved', () => {
    const r = run(['--bundle', REAL_BUNDLE, '--require-approved']);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain('non-approved-content');
  });

  it('exits 4 when a content file is tampered', () => {
    const tmp = copyBundle();
    try {
      const p = resolve(tmp, 'conditions.json');
      writeFileSync(p, readFileSync(p, 'utf8') + '\n');
      const r = run(['--bundle', tmp]);
      expect(r.code).toBe(4);
      expect(r.stdout.toLowerCase()).toContain('hash');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('exits 4 when the manifest signature is broken', () => {
    const tmp = copyBundle();
    try {
      const p = resolve(tmp, 'manifest.json');
      const m = JSON.parse(readFileSync(p, 'utf8'));
      m.signedBy = 'attacker';
      writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
      const r = run(['--bundle', tmp]);
      expect(r.code).toBe(4);
      expect(r.stdout.toLowerCase()).toContain('signature');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
