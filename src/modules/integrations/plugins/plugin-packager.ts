import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { createZip, type ZipEntry } from './zip';

/**
 * Builds downloadable plugin archives from plugins/ according to
 * plugins/packages.json.
 *
 * Shared by the packaging script (which writes content/plugins/) and by
 * the drift test (which rebuilds in memory and compares hashes), so the
 * two can never disagree about what a package contains.
 */

export interface PackageSource {
  /** Path under plugins/ — a directory or a single file. */
  from: string;
  /** Path inside the archive. "" places a directory's contents at the root. */
  to: string;
  /** Top-level names under `from` to leave out (e.g. "test"). */
  exclude?: string[];
}

export interface PackageDefinition {
  id: string;
  name: string;
  version: string;
  summary: string;
  integrations: string[];
  install: string;
  sources: PackageSource[];
}

export interface PackageManifestEntry {
  id: string;
  name: string;
  version: string;
  summary: string;
  integrations: string[];
  install: string;
  file: string;
  bytes: number;
  sha256: string;
  fileCount: number;
}

export interface PackageManifest {
  generatedFrom: string;
  packages: PackageManifestEntry[];
}

/** Never shipped, wherever they appear: build debris and local secrets. */
const ALWAYS_EXCLUDED = new Set(['__pycache__', 'node_modules', '.DS_Store', '.env', '.git']);
const EXCLUDED_SUFFIXES = ['.pyc', '.log'];

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function loadPackageDefinitions(pluginsDir: string): PackageDefinition[] {
  const raw = JSON.parse(readFileSync(join(pluginsDir, 'packages.json'), 'utf8')) as {
    packages: PackageDefinition[];
  };
  const seen = new Set<string>();
  for (const def of raw.packages) {
    if (!ID_PATTERN.test(def.id)) throw new Error(`Invalid package id: ${def.id}`);
    if (!VERSION_PATTERN.test(def.version)) {
      throw new Error(`Invalid version for ${def.id}: ${def.version}`);
    }
    if (seen.has(def.id)) throw new Error(`Duplicate package id: ${def.id}`);
    seen.add(def.id);
  }
  return raw.packages;
}

export function packageFileName(def: Pick<PackageDefinition, 'id' | 'version'>): string {
  return `vedamd-${def.id}-${def.version}.zip`;
}

export function buildPackage(
  pluginsDir: string,
  def: PackageDefinition,
): { zip: Buffer; fileCount: number } {
  const root = resolve(pluginsDir);
  const entries: ZipEntry[] = [];

  for (const source of def.sources) {
    const from = resolve(root, source.from);
    if (from !== root && !from.startsWith(root + sep)) {
      throw new Error(`${def.id}: source escapes plugins/: ${source.from}`);
    }
    const exclude = new Set(source.exclude ?? []);

    if (statSync(from).isFile()) {
      entries.push(toEntry(from, source.to));
      continue;
    }

    for (const file of walk(from)) {
      const rel = relative(from, file).split(sep).join('/');
      if (exclude.has(rel.split('/')[0])) continue;
      entries.push(toEntry(file, source.to ? posix.join(source.to, rel) : rel));
    }
  }

  if (entries.length === 0) throw new Error(`${def.id}: package has no files`);
  return { zip: createZip(entries), fileCount: entries.length };
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function toEntry(file: string, path: string): ZipEntry {
  // Mode from the file name, not the filesystem: executable bits do not
  // survive every checkout (Windows, some CI caches), and the archive
  // must be byte-identical wherever it is built.
  return { path, data: readFileSync(file), mode: path.endsWith('.sh') ? 0o755 : 0o644 };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (ALWAYS_EXCLUDED.has(name) || EXCLUDED_SUFFIXES.some((s) => name.endsWith(s))) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}
