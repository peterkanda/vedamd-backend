import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { AppConfig } from '../../config/configuration';

export interface ContentManifest {
  version: string;
  signedBy: string;
  signedAt: string;
  files: Array<{ name: string; sha256: string; size: number }>;
}

/**
 * Serves the signed offline content bundle so the mobile app can sync
 * the clinical JSON it ships with (FR-150 — offline rule bundle
 * distribution). The bytes returned are the *exact* signed bytes on
 * disk, so the app's Ed25519 + per-file SHA-256 verification still
 * holds end-to-end. Stateless, no PHI.
 */
@Injectable()
export class ContentDistributionService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private bundleDir(): string {
    return resolve(this.config.get('content.bundleDir', { infer: true }));
  }

  /** Active bundle version derived from the manifest. */
  manifest(): ContentManifest {
    const file = join(this.bundleDir(), 'manifest.json');
    if (!existsSync(file)) {
      throw new NotFoundException('Content manifest not found.');
    }
    return JSON.parse(readFileSync(file, 'utf8')) as ContentManifest;
  }

  /** Detached Ed25519 signature over the manifest (hex/base64 as stored). */
  manifestSignature(): Buffer {
    const file = join(this.bundleDir(), 'manifest.sig');
    if (!existsSync(file)) throw new NotFoundException('Manifest signature not found.');
    return readFileSync(file);
  }

  /** Ed25519 public key (PEM) the app pins to verify the signature. */
  publicKeyPem(): string {
    const file = join(this.bundleDir(), 'public-key.pem');
    if (!existsSync(file)) throw new NotFoundException('Public key not found.');
    return readFileSync(file, 'utf8');
  }

  /**
   * Stream one bundle file's raw bytes. Guards against path traversal by
   * resolving against the bundle dir and rejecting anything that escapes
   * it or is not a plain file name.
   */
  fileStream(name: string): { stream: ReturnType<typeof createReadStream>; size: number } {
    if (name !== basename(name)) {
      throw new NotFoundException('Invalid file name.');
    }
    const full = resolve(join(this.bundleDir(), name));
    if (!full.startsWith(this.bundleDir()) || !existsSync(full)) {
      throw new NotFoundException(`Bundle file not found: ${name}`);
    }
    const { size } = this.manifest().files.find((f) => f.name === name) ?? { size: 0 };
    return { stream: createReadStream(full), size };
  }
}
