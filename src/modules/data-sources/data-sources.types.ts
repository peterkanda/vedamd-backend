import type { QueryMapping, SqlDialect } from '../agentic/connectors/sql-connector.types';

/**
 * Per-integrator SQL data-source registrations (connections + named
 * queries). Replaces the env-var-only registration path with a runtime
 * CRUD UI. Connection URLs are AEAD-encrypted server-side and never
 * returned over the API.
 *
 * Audited via the clinical-audits module: each audit references a
 * connectionId + namedQueryId from this module.
 */

export interface ConnectionSummary {
  id: string;
  name: string;
  dialect: SqlDialect;
  ssl: boolean;
  maxRows: number;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface ConnectionCreateDto {
  /** Stable lookup id — referenced by named queries + audits. Kebab-case recommended (e.g. "prod-postgres"). */
  id: string;
  name: string;
  dialect: SqlDialect;
  /** Raw connection URL — encrypted on receipt, never persisted plaintext. */
  url: string;
  ssl?: boolean;
  maxRows?: number;
}

export interface ConnectionUpdateDto {
  name?: string;
  dialect?: SqlDialect;
  /** Provide only when rotating credentials. Omitted = unchanged. */
  url?: string;
  ssl?: boolean;
  maxRows?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Provider-specific error message when ok=false. */
  error?: string;
  /** Round-trip latency in ms when ok=true. */
  latencyMs?: number;
}

export interface NamedQuerySummary {
  id: string;
  /** Same id-as-key; surfaced separately for stability. */
  queryKey: string;
  name: string;
  description?: string | null;
  connectionId?: string | null;
  createdAt: string;
}

export interface NamedQueryRecord extends NamedQuerySummary {
  sql: string;
  mapping: QueryMapping;
}

export interface NamedQueryCreateDto {
  id: string;
  name: string;
  description?: string;
  connectionId?: string;
  sql: string;
  mapping: QueryMapping;
}

export interface NamedQueryUpdateDto {
  name?: string;
  description?: string | null;
  connectionId?: string | null;
  sql?: string;
  mapping?: QueryMapping;
}
