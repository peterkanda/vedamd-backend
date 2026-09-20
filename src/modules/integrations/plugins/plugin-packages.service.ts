import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../../common/phi-free-logger';
import { sha256, type PackageManifest, type PackageManifestEntry } from './plugin-packager';

/** Public shape of a downloadable plugin — the manifest entry minus the on-disk file name. */
export type PluginPackage = Omit<PackageManifestEntry, 'file'> & { fileName: string };

/**
 * Serves the plugin archives built by `npm run plugins:package`.
 *
 * Archives are loaded and hash-checked once at startup. A package whose
 * bytes do not match the manifest is withheld rather than served: a
 * truncated or tampered plugin installed into an EMR is worse than a
 * missing download, and the mismatch is logged for the operator.
 */
@Injectable()
export class PluginPackagesService implements OnModuleInit {
  private packages: PluginPackage[] = [];
  private readonly archives = new Map<string, Buffer>();

  constructor(@Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger) {}

  onModuleInit(): void {
    this.load(resolve(process.env.PLUGIN_PACKAGE_DIR ?? 'content/plugins'));
  }

  /** Loads and hash-checks every archive in `dir`. Replaces anything loaded before. */
  load(dir: string): void {
    this.packages = [];
    this.archives.clear();

    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      this.log.warn('plugin_packages_missing', {
        component: 'plugin-packages',
        error_category: 'config',
        message: 'content/plugins/manifest.json not found — run npm run plugins:package',
      });
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
    for (const entry of manifest.packages) {
      // basename() pins the file to this directory whatever the manifest says.
      const file = join(dir, basename(entry.file));
      if (!existsSync(file)) {
        this.log.warn('plugin_package_unavailable', {
          component: `plugin:${entry.id}`,
          error_category: 'missing',
        });
        continue;
      }
      const bytes = readFileSync(file);
      if (sha256(bytes) !== entry.sha256 || bytes.length !== entry.bytes) {
        this.log.warn('plugin_package_unavailable', {
          component: `plugin:${entry.id}`,
          error_category: 'integrity',
        });
        continue;
      }
      this.packages.push({
        id: entry.id,
        name: entry.name,
        version: entry.version,
        summary: entry.summary,
        integrations: entry.integrations,
        install: entry.install,
        bytes: entry.bytes,
        sha256: entry.sha256,
        fileCount: entry.fileCount,
        fileName: basename(entry.file),
      });
      this.archives.set(entry.id, bytes);
    }
  }

  list(): PluginPackage[] {
    return this.packages;
  }

  forIntegration(slug: string): PluginPackage[] {
    return this.packages.filter((p) => p.integrations.includes(slug));
  }

  get(id: string): { meta: PluginPackage; bytes: Buffer } | null {
    const meta = this.packages.find((p) => p.id === id);
    const bytes = this.archives.get(id);
    return meta && bytes ? { meta, bytes } : null;
  }
}
