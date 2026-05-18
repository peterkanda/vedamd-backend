import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

export type ApiKeyScope =
  | 'cds:evaluate'
  | 'cds:discover'
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
 * In-memory API key registry. v0.1 uses an in-process Map;
 * production replaces with a Postgres-backed implementation and
 * stores only the HMAC fingerprint server-side (FR-313).
 */
@Injectable()
export class ApiKeysService {
  private readonly byId = new Map<string, ApiKeyRecord>();

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
    const fingerprint = createHmac('sha256', 'fingerprint-key').update(secret).digest('hex').slice(0, 16);

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
    return { ...record, secret };
  }

  revoke(integratorId: string, id: string): ApiKeyRecord | null {
    const k = this.byId.get(id);
    if (!k || k.integratorId !== integratorId) return null;
    const updated: ApiKeyRecord = { ...k, revokedAt: new Date().toISOString() };
    this.byId.set(id, updated);
    return updated;
  }
}
