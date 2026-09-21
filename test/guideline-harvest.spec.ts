import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The guideline harvester is link-and-metadata only, by licence.
 *
 * Every MoH source is tier 3 / cite-only / moh-restricted, and
 * content/sources/README.md says to cite and link, author original logic
 * from the underlying clinical facts, and secure permission where logic
 * derives from national guidelines. A future change that starts storing
 * guideline text would contradict that and fail bundle:check-licence — so
 * pin the posture here, where it is cheap to notice.
 */
const SCRIPT = readFileSync(resolve(__dirname, '..', 'scripts/harvest-guideline-links.ts'), 'utf8');
const SOURCES = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'content/guidelines/sources.json'), 'utf8'),
) as {
  countries: Array<{ cc: string; registrySource: string; entryPoints: string[] }>;
  whatWeNeverCapture: string[];
};
const REGISTRY = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'content/sources/registry.json'), 'utf8'),
) as { sources: Array<{ id: string; embeddable: string; citationLicence: string }> };

describe('guideline harvester stays within the MoH licence', () => {
  it('never writes a document body', () => {
    // The hash is taken from the bytes and the bytes are dropped; nothing
    // in the emitted record may hold text pulled out of the PDF.
    expect(SCRIPT).not.toMatch(/\btext\s*:\s*(?!.*anchor)/);
    expect(SCRIPT).toContain('sha256');
  });

  it('declares what it refuses to capture', () => {
    expect(SOURCES.whatWeNeverCapture.join(' ')).toMatch(/body text/i);
  });

  it('points every country at a registered cite-only MoH source', () => {
    for (const c of SOURCES.countries) {
      const src = REGISTRY.sources.find((s) => s.id === c.registrySource);
      expect(src, `${c.cc} names an unregistered source ${c.registrySource}`).toBeDefined();
      expect(src!.embeddable).toBe('cite-only');
      expect(src!.citationLicence).toBe('moh-restricted');
    }
  });

  it('covers the countries the platform claims to localise', () => {
    const configured = new Set(SOURCES.countries.map((c) => c.cc));
    for (const cc of ['KE', 'UG', 'TZ', 'RW', 'ET', 'NG', 'GH', 'ZA', 'ZM', 'MW']) {
      expect(configured.has(cc), `no guideline entry point for ${cc}`).toBe(true);
    }
  });
});
