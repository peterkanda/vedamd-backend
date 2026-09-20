/**
 * Builds the downloadable plugin archives served by
 * GET /v1/integrations/plugins/:id/download.
 *
 *   npm run plugins:package
 *
 * Reads plugins/packages.json, zips each package deterministically into
 * content/plugins/, and writes content/plugins/manifest.json with the
 * SHA-256 of every archive. Commit the output: the backend deploys from
 * this repository and serves exactly these bytes.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildPackage,
  loadPackageDefinitions,
  packageFileName,
  sha256,
  type PackageManifest,
} from '../src/modules/integrations/plugins/plugin-packager';

const pluginsDir = resolve(__dirname, '..', 'plugins');
const outDir = resolve(__dirname, '..', 'content', 'plugins');

mkdirSync(outDir, { recursive: true });
// Remove superseded archives so an old version is never still downloadable.
for (const name of readdirSync(outDir)) {
  if (name.endsWith('.zip')) rmSync(join(outDir, name));
}

const manifest: PackageManifest = { generatedFrom: 'plugins/packages.json', packages: [] };

for (const def of loadPackageDefinitions(pluginsDir)) {
  const { zip, fileCount } = buildPackage(pluginsDir, def);
  const file = packageFileName(def);
  writeFileSync(join(outDir, file), zip);
  manifest.packages.push({
    id: def.id,
    name: def.name,
    version: def.version,
    summary: def.summary,
    integrations: def.integrations,
    install: def.install,
    file,
    bytes: zip.length,
    sha256: sha256(zip),
    fileCount,
  });
  console.log(`${file.padEnd(40)} ${String(fileCount).padStart(3)} files  ${zip.length} bytes`);
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json  ${manifest.packages.length} packages`);
