import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildPackage,
  loadPackageDefinitions,
  packageFileName,
  sha256,
  type PackageManifest,
} from '../src/modules/integrations/plugins/plugin-packager';
import { createZip, readZipEntries } from '../src/modules/integrations/plugins/zip';
import { PluginPackagesService } from '../src/modules/integrations/plugins/plugin-packages.service';
import { INTEGRATIONS } from '../src/modules/integrations/integrations.data';
import { PhiFreeLogger } from '../src/common/phi-free-logger/phi-free-logger';
import { makeCdsService } from './helpers/make-cds-service';

const pluginsDir = resolve(__dirname, '..', 'plugins');
const contentDir = resolve(__dirname, '..', 'content', 'plugins');
const manifest = JSON.parse(
  readFileSync(join(contentDir, 'manifest.json'), 'utf8'),
) as PackageManifest;
const definitions = loadPackageDefinitions(pluginsDir);

const paths = (id: string) => {
  const entry = manifest.packages.find((p) => p.id === id)!;
  return readZipEntries(readFileSync(join(contentDir, entry.file)));
};

function service(dir = contentDir): PluginPackagesService {
  const svc = new PluginPackagesService(
    new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true }),
  );
  svc.load(dir);
  return svc;
}

describe('plugin packages — committed archives match the source', () => {
  // If this fails: run `npm run plugins:package` and commit content/plugins.
  // It exists so a fixed plugin can never ship as its old, broken download.
  for (const def of definitions) {
    it(`${def.id} archive is up to date`, () => {
      const entry = manifest.packages.find((p) => p.id === def.id);
      expect(entry, `${def.id} missing from manifest`).toBeDefined();
      expect(entry!.file).toBe(packageFileName(def));
      expect(entry!.version).toBe(def.version);
      expect(entry!.integrations).toEqual(def.integrations);

      const rebuilt = buildPackage(pluginsDir, def);
      expect(sha256(rebuilt.zip)).toBe(entry!.sha256);
      expect(sha256(readFileSync(join(contentDir, entry!.file)))).toBe(entry!.sha256);
    });
  }

  it('manifest lists exactly the defined packages', () => {
    expect(manifest.packages.map((p) => p.id).sort()).toEqual(definitions.map((d) => d.id).sort());
  });

  it('every package points at a real catalogue integration', () => {
    const slugs = new Set(INTEGRATIONS.map((i) => i.slug));
    for (const def of definitions) {
      for (const slug of def.integrations)
        expect(slugs.has(slug), `${def.id} → ${slug}`).toBe(true);
    }
  });
});

describe('plugin packages — install layout each platform requires', () => {
  it('OpenEMR: unzips to oe-module-vedamd-cds/ with the bootstrap at its root', () => {
    const names = paths('openemr').map((e) => e.path);
    expect(names.every((n) => n.startsWith('oe-module-vedamd-cds/'))).toBe(true);
    expect(names).toContain('oe-module-vedamd-cds/openemr.bootstrap.php');
    expect(names).toContain('oe-module-vedamd-cds/info.txt');
  });

  it('DHIS2: manifest.webapp at the zip root, as App Management requires', () => {
    const entries = paths('dhis2');
    const manifestEntry = entries.find((e) => e.path === 'manifest.webapp');
    expect(manifestEntry).toBeDefined();
    const webapp = JSON.parse(manifestEntry!.data.toString('utf8'));
    expect(webapp.launch_path).toBe('index.html');
    expect(webapp.activities.dhis.href).toBe('*');
    expect(entries.map((e) => e.path)).toContain(webapp.launch_path);
  });

  it('Frappe: bench app layout (pyproject, hooks, modules.txt, patches.txt)', () => {
    const names = paths('frappe').map((e) => e.path);
    for (const required of [
      'vedamd_cds/pyproject.toml',
      'vedamd_cds/vedamd_cds/__init__.py',
      'vedamd_cds/vedamd_cds/hooks.py',
      'vedamd_cds/vedamd_cds/modules.txt',
      'vedamd_cds/vedamd_cds/patches.txt',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('GNU Health: folder name matches the registered Tryton module name', () => {
    const entries = paths('gnu-health');
    expect(entries.every((e) => e.path.startsWith('vedamd_cds/'))).toBe(true);
    const init = entries.find((e) => e.path === 'vedamd_cds/__init__.py')!.data.toString('utf8');
    expect(init).toContain("module='vedamd_cds'");
    expect(entries.map((e) => e.path)).toContain('vedamd_cds/tryton.cfg');
  });

  it('shell scripts are executable and no secrets or build debris ship', () => {
    for (const entry of manifest.packages) {
      for (const e of paths(entry.id)) {
        if (e.path.endsWith('.sh')) expect(e.mode, e.path).toBe(0o755);
        expect(e.path).not.toMatch(/(^|\/)\.env$|__pycache__|\.pyc$|node_modules|\.DS_Store/);
      }
    }
  });

  it('OpenMRS/Bahmni pack bundles the bridge so it can be built without a registry image', () => {
    const names = paths('openmrs-bahmni').map((e) => e.path);
    expect(names).toContain('vedamd-openmrs-bahmni/verify.sh');
    expect(names).toContain('vedamd-openmrs-bahmni/vedamd-cds-bridge/Dockerfile');
    expect(names).toContain('vedamd-openmrs-bahmni/vedamd-cds-bridge/docker-compose.yml');
  });
});

describe('Epic / Oracle Health pack', () => {
  it('the shipped sample request actually produces the interaction card', async () => {
    const sample = JSON.parse(
      readFileSync(join(pluginsDir, 'epic', 'sample-order-select.json'), 'utf8'),
    );
    const res = await makeCdsService().evaluateHook('vedamd-order-select', sample);
    const summaries = res.cards.map((c) => c.summary.toLowerCase()).join(' | ');
    expect(summaries).toContain('warfarin');
    expect(summaries).toContain('ibuprofen');
  });
});

describe('PluginPackagesService', () => {
  it('serves every committed package', () => {
    const svc = service();
    expect(
      svc
        .list()
        .map((p) => p.id)
        .sort(),
    ).toEqual(definitions.map((d) => d.id).sort());
    expect(svc.forIntegration('openemr').map((p) => p.id)).toEqual(['openemr']);
    expect(svc.get('dhis2')!.bytes.length).toBe(svc.get('dhis2')!.meta.bytes);
  });

  it('withholds an archive whose bytes do not match the manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vedamd-plugins-'));
    copyFileSync(join(contentDir, 'manifest.json'), join(dir, 'manifest.json'));
    for (const entry of manifest.packages) {
      copyFileSync(join(contentDir, entry.file), join(dir, entry.file));
    }
    const tampered = manifest.packages.find((p) => p.id === 'openemr')!;
    const bytes = readFileSync(join(dir, tampered.file));
    bytes[bytes.length - 30] ^= 0xff;
    writeFileSync(join(dir, tampered.file), bytes);

    const svc = service(dir);
    expect(svc.get('openemr')).toBeNull();
    expect(svc.get('dhis2')).not.toBeNull();
  });

  it('serves nothing, rather than throwing, when packages were never built', () => {
    const svc = service(mkdtempSync(join(tmpdir(), 'vedamd-empty-')));
    expect(svc.list()).toEqual([]);
  });
});

describe('createZip', () => {
  it('is deterministic regardless of input order', () => {
    const a = createZip([
      { path: 'x/b.txt', data: Buffer.from('b') },
      { path: 'x/a.txt', data: Buffer.from('a') },
    ]);
    const b = createZip([
      { path: 'x/a.txt', data: Buffer.from('a') },
      { path: 'x/b.txt', data: Buffer.from('b') },
    ]);
    expect(sha256(a)).toBe(sha256(b));
  });

  it('refuses paths that could escape the extraction directory', () => {
    for (const bad of ['../evil', '/etc/passwd', 'a/../../b', 'a\\b', 'a//b']) {
      expect(() => createZip([{ path: bad, data: Buffer.alloc(0) }])).toThrow(/Unsafe/);
    }
  });

  it('round-trips content and modes', () => {
    const zip = createZip([{ path: 'p/run.sh', data: Buffer.from('#!/bin/sh\n'), mode: 0o755 }]);
    const [entry] = readZipEntries(zip);
    expect(entry.path).toBe('p/run.sh');
    expect(entry.mode).toBe(0o755);
    expect(entry.data.toString()).toBe('#!/bin/sh\n');
  });
});
