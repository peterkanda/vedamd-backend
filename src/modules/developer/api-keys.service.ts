import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';

export type ApiKeyScope =
  | 'cds:evaluate'
  | 'cds:discover'
  | 'content:read'
  | 'drug-info:read'
  | 'terminology:read'
  | 'bundles:read'
  | 'integration-log:read';

export type ApiKeyEnvironment = 'sandbox' | 'production';

export interface ApiKeyRecord {
  id: string;
  integratorId: string;
  name: string;
  fingerprint: string;
  scopes: ApiKeyScope[];
  environment: ApiKeyEnvironment;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface ApiKeyCreatedOnce extends ApiKeyRecord {
  /** Shown once at creation; never stored. */
  secret: string;
}

/**
 * In-memory API key registry (FR-313).
 *
 * v0.1: in-process Map. Production replaces with a Postgres-backed
 * implementation that stores only the HMAC fingerprint, never the
 * secret. The HMAC secret comes from configuration so it can be
 * rotated and so dev/test/prod never share fingerprints.
 *
 * The presented secret is compared in constant time to prevent
 * lookup-timing leaks.
 */
@Injectable()
export class ApiKeysService {
  private readonly byId = new Map<string, ApiKeyRecord>();
  private readonly byFingerprint = new Map<string, ApiKeyRecord>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  list(integratorId: string): ApiKeyRecord[] {
    return [...this.byId.values()].filter((k) => k.integratorId === integratorId);
  }

  create(input: {
    integratorId: string;
    name: string;
    scopes: ApiKeyScope[];
    environment: ApiKeyEnvironment;
  }): ApiKeyCreatedOnce {
    const id = randomBytes(8).toString('hex');
    const secret = `vmd_${input.environment === 'production' ? 'live' : 'test'}_${randomBytes(24).toString('base64url')}`;
    const fingerprint = this.fingerprint(secret);

    const record: ApiKeyRecord = {
      id,
      integratorId: input.integratorId,
      name: input.name,
      fingerprint,
      scopes: input.scopes,
      environment: input.environment,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(id, record);
    this.byFingerprint.set(fingerprint, record);
    return { ...record, secret };
  }

  revoke(integratorId: string, id: string): ApiKeyRecord | null {
    const k = this.byId.get(id);
    if (!k || k.integratorId !== integratorId) return null;
    const updated: ApiKeyRecord = { ...k, revokedAt: new Date().toISOString() };
    this.byId.set(id, updated);
    this.byFingerprint.set(updated.fingerprint, updated);
    return updated;
  }

  /**
   * Validate a bearer token. Returns the matching record on success,
   * null on any failure (missing, malformed, unknown, revoked).
   *
   * The comparison is constant-time on the fingerprint to deny any
   * leak about which keys exist server-side.
   */
  validateBearer(token: string | undefined): ApiKeyRecord | null {
    if (!token || !token.startsWith('vmd_')) return null;
    const fingerprint = this.fingerprint(token);
    const candidate = this.byFingerprint.get(fingerprint);
    if (!candidate) return null;
    if (candidate.revokedAt) return null;

    const a = Buffer.from(candidate.fingerprint, 'hex');
    const b = Buffer.from(fingerprint, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return candidate;
  }

  /** Record usage on the in-memory record. */
  recordUsage(id: string, when: Date = new Date()): void {
    const k = this.byId.get(id);
    if (!k) return;
    const updated: ApiKeyRecord = { ...k, lastUsedAt: when.toISOString() };
    this.byId.set(id, updated);
    this.byFingerprint.set(updated.fingerprint, updated);
  }

  private fingerprint(secret: string): string {
    const hmacKey = this.config.get('apiKeys.fingerprintSecret', { infer: true });
    return createHmac('sha256', hmacKey).update(secret).digest('hex');
  }
}
