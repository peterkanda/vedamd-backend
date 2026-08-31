import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { sqlConnections as connsTable, sqlNamedQueries as queriesTable } from '../../db/schema';
import { decryptSecret, encryptSecret } from '../../common/secrets-vault';
import { assertHostAllowedLiteral, ssrfOptionsFromEnv } from '../../common/ssrf-guard';
import { SqlIngestionService } from '../agentic/connectors/sql-ingestion.service';
import {
  assertReadOnly,
  type QueryMapping,
  type SqlDialect,
} from '../agentic/connectors/sql-connector.types';
import type {
  ConnectionCreateDto,
  ConnectionSummary,
  ConnectionTestResult,
  ConnectionUpdateDto,
  NamedQueryCreateDto,
  NamedQueryRecord,
  NamedQuerySummary,
  NamedQueryUpdateDto,
} from './data-sources.types';

interface ConnectionMem {
  id: string;
  integratorId: string;
  name: string;
  dialect: SqlDialect;
  encryptedUrl: string;
  ssl: boolean;
  maxRows: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastUsedAt?: string | null;
}

interface QueryMem {
  id: string;
  integratorId: string;
  queryKey: string;
  name: string;
  description?: string | null;
  connectionId?: string | null;
  sql: string;
  mapping: QueryMapping;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * Per-integrator SQL connection + named-query store. Mirrors the
 * pattern of PoliciesService / CustomRulesService / NotificationsService:
 * Postgres via drizzle when DATABASE_URL is configured; in-memory
 * fallback for dev / unit tests.
 *
 * Connection URLs (which hold database credentials) are AEAD-encrypted
 * with the integratorId as Additional Authenticated Data, so a stolen
 * ciphertext from tenant A cannot decrypt as tenant B. The plaintext
 * URL never reaches the database or any application log.
 *
 * On create / update, the corresponding entry is also pushed into
 * SqlIngestionService's in-memory registry so it's immediately
 * available to the agentic SQL pipeline + clinical-audits runner
 * without an app restart.
 */
@Injectable()
export class DataSourcesService implements OnModuleInit {
  private readonly nestLogger = new Logger(DataSourcesService.name);
  private readonly memConns = new Map<string, ConnectionMem[]>();
  private readonly memQueries = new Map<string, QueryMem[]>();

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null,
    private readonly sql: SqlIngestionService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.db) {
      this.nestLogger.log('DataSourcesService using Postgres (drizzle) storage.');
    } else {
      this.nestLogger.warn(
        'DataSourcesService running with IN-MEMORY store (no DATABASE_URL). Entries are lost on restart.',
      );
    }
    // Hydrate the SqlIngestionService registry from DB on boot so that
    // CDS / audit flows see persisted connections without env vars.
    await this.hydrateIngestionRegistry();
  }

  /** Push every persisted connection + query into SqlIngestionService's
   *  in-memory registries. */
  private async hydrateIngestionRegistry(): Promise<void> {
    if (!this.db) return;
    try {
      const conns = await this.db.select().from(connsTable);
      for (const c of conns) {
        const url = decryptSecret(c.encryptedUrl, c.integratorId);
        this.sql.registerConnection({
          id: c.id,
          dialect: c.dialect as SqlDialect,
          url,
          ssl: c.ssl,
          maxRows: c.maxRows,
        });
      }
      const queries = await this.db.select().from(queriesTable);
      for (const q of queries) {
        this.sql.registerQuery({
          id: q.queryKey,
          sql: q.sql,
          mapping: q.mapping as QueryMapping,
        });
      }
      this.nestLogger.log(
        `Hydrated SqlIngestionService with ${conns.length} connection(s) and ${queries.length} query(ies) from DB.`,
      );
    } catch (err) {
      this.nestLogger.warn(
        `Failed to hydrate SqlIngestionService from DB: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /* ── Connections ───────────────────────────────────────────────── */

  async listConnections(integratorId: string): Promise<ConnectionSummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(connsTable)
        .where(eq(connsTable.integratorId, integratorId))
        .orderBy(desc(connsTable.createdAt));
      return rows.map(rowToConnSummary);
    }
    return (this.memConns.get(integratorId) ?? []).map(memToConnSummary);
  }

  async getConnection(integratorId: string, id: string): Promise<ConnectionSummary | null> {
    const row = await this.findConnInternal(integratorId, id);
    return row ? memToConnSummary(row) : null;
  }

  async createConnection(
    integratorId: string,
    dto: ConnectionCreateDto,
    createdBy?: string,
  ): Promise<ConnectionSummary> {
    if (!dto.id?.trim()) throw new Error('Connection id is required.');
    if (!/^[a-z0-9-]{1,64}$/.test(dto.id)) {
      throw new Error('Connection id must be kebab-case (a-z 0-9 -), 1-64 chars.');
    }
    if (!['postgres', 'mysql', 'mssql', 'oracle'].includes(dto.dialect)) {
      throw new Error('dialect must be postgres / mysql / mssql / oracle.');
    }
    if (!dto.url?.trim()) throw new Error('url is required (will be encrypted).');
    // SSRF: reject connections pointing at loopback/private/link-local
    // hosts (or hosts outside the configured allowlist) before we store
    // or register them. DNS-aware re-check happens again at connect time.
    assertHostAllowedLiteral(dto.url.trim(), ssrfOptionsFromEnv());

    const encryptedUrl = encryptSecret(dto.url.trim(), integratorId);
    const now = new Date().toISOString();
    const row: ConnectionMem = {
      id: dto.id.trim(),
      integratorId,
      name: dto.name.trim(),
      dialect: dto.dialect,
      encryptedUrl,
      ssl: dto.ssl ?? false,
      maxRows: dto.maxRows ?? 10000,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (this.db) {
      await this.db.insert(connsTable).values({
        id: row.id,
        integratorId,
        name: row.name,
        dialect: row.dialect,
        encryptedUrl: row.encryptedUrl,
        ssl: row.ssl,
        maxRows: row.maxRows,
        createdBy,
      });
    } else {
      const arr = this.memConns.get(integratorId) ?? [];
      arr.unshift(row);
      this.memConns.set(integratorId, arr);
    }

    // Push into the ingestion registry immediately.
    this.sql.registerConnection({
      id: row.id,
      dialect: row.dialect,
      url: dto.url.trim(),
      ssl: row.ssl,
      maxRows: row.maxRows,
    });

    return memToConnSummary(row);
  }

  async updateConnection(
    integratorId: string,
    id: string,
    dto: ConnectionUpdateDto,
  ): Promise<ConnectionSummary> {
    const existing = await this.findConnInternal(integratorId, id);
    if (!existing) throw new NotFoundException(`Connection not found: ${id}`);
    if (dto.url?.trim()) assertHostAllowedLiteral(dto.url.trim(), ssrfOptionsFromEnv());
    const encryptedUrl = dto.url
      ? encryptSecret(dto.url.trim(), integratorId)
      : existing.encryptedUrl;
    const merged: ConnectionMem = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      dialect: dto.dialect ?? existing.dialect,
      encryptedUrl,
      ssl: dto.ssl ?? existing.ssl,
      maxRows: dto.maxRows ?? existing.maxRows,
      updatedAt: new Date().toISOString(),
    };

    if (this.db) {
      await this.db
        .update(connsTable)
        .set({
          name: merged.name,
          dialect: merged.dialect,
          encryptedUrl: merged.encryptedUrl,
          ssl: merged.ssl,
          maxRows: merged.maxRows,
          updatedAt: new Date(),
        })
        .where(and(eq(connsTable.integratorId, integratorId), eq(connsTable.id, id)));
    } else {
      const arr = this.memConns.get(integratorId) ?? [];
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr[idx] = merged;
    }

    // Refresh the ingestion registry with the (possibly rotated) URL.
    const plainUrl = dto.url?.trim() ?? decryptSecret(existing.encryptedUrl, integratorId);
    this.sql.registerConnection({
      id: merged.id,
      dialect: merged.dialect,
      url: plainUrl,
      ssl: merged.ssl,
      maxRows: merged.maxRows,
    });

    return memToConnSummary(merged);
  }

  async removeConnection(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      await this.db
        .delete(connsTable)
        .where(and(eq(connsTable.integratorId, integratorId), eq(connsTable.id, id)));
      return true;
    }
    const arr = this.memConns.get(integratorId) ?? [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  /** Run a simple `SELECT 1` against the connection to confirm it works. */
  async testConnection(integratorId: string, id: string): Promise<ConnectionTestResult> {
    const row = await this.findConnInternal(integratorId, id);
    if (!row) return { ok: false, error: `Connection not found: ${id}` };
    try {
      const url = decryptSecret(row.encryptedUrl, integratorId);
      // Register temporarily under a probe id so we use the public path.
      const probeId = `__probe__${id}__${Date.now()}`;
      this.sql.registerConnection({
        id: probeId,
        dialect: row.dialect,
        url,
        ssl: row.ssl,
        maxRows: 1,
      });
      const probeQueryId = `${probeId}-q`;
      this.sql.registerQuery({
        id: probeQueryId,
        sql: 'SELECT 1 AS ok',
        mapping: {},
      });
      const start = Date.now();
      await this.sql.fetchRows(probeId, probeQueryId, {});
      const latencyMs = Date.now() - start;
      // Touch lastUsedAt on the real row.
      void this.touchConnLastUsed(integratorId, id).catch(() => {});
      return { ok: true, latencyMs };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Connection test failed.',
      };
    }
  }

  private async findConnInternal(integratorId: string, id: string): Promise<ConnectionMem | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(connsTable)
        .where(and(eq(connsTable.integratorId, integratorId), eq(connsTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        integratorId: r.integratorId,
        name: r.name,
        dialect: r.dialect as SqlDialect,
        encryptedUrl: r.encryptedUrl,
        ssl: r.ssl,
        maxRows: r.maxRows,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        createdBy: r.createdBy ?? undefined,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      };
    }
    return (this.memConns.get(integratorId) ?? []).find((r) => r.id === id) ?? null;
  }

  private async touchConnLastUsed(integratorId: string, id: string): Promise<void> {
    if (this.db) {
      await this.db
        .update(connsTable)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(connsTable.integratorId, integratorId), eq(connsTable.id, id)));
      return;
    }
    const arr = this.memConns.get(integratorId) ?? [];
    const row = arr.find((r) => r.id === id);
    if (row) row.lastUsedAt = new Date().toISOString();
  }

  /* ── Named queries ─────────────────────────────────────────────── */

  async listQueries(integratorId: string): Promise<NamedQuerySummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(queriesTable)
        .where(eq(queriesTable.integratorId, integratorId))
        .orderBy(desc(queriesTable.createdAt));
      return rows.map(rowToQuerySummary);
    }
    return (this.memQueries.get(integratorId) ?? []).map(memToQuerySummary);
  }

  async getQuery(integratorId: string, id: string): Promise<NamedQueryRecord | null> {
    const row = await this.findQueryInternal(integratorId, id);
    return row ? memToQueryRecord(row) : null;
  }

  async createQuery(
    integratorId: string,
    dto: NamedQueryCreateDto,
    createdBy?: string,
  ): Promise<NamedQueryRecord> {
    if (!dto.id?.trim()) throw new Error('Query id is required.');
    if (!/^[a-z0-9-]{1,64}$/.test(dto.id)) {
      throw new Error('Query id must be kebab-case (a-z 0-9 -), 1-64 chars.');
    }
    // assertReadOnly throws if the SQL is not a plain SELECT/WITH.
    assertReadOnly(dto.sql);

    const now = new Date().toISOString();
    const row: QueryMem = {
      id: dto.id.trim(),
      integratorId,
      queryKey: dto.id.trim(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      connectionId: dto.connectionId?.trim() || null,
      sql: dto.sql,
      mapping: dto.mapping ?? {},
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (this.db) {
      await this.db.insert(queriesTable).values({
        id: row.id,
        integratorId,
        queryKey: row.queryKey,
        name: row.name,
        description: row.description ?? null,
        connectionId: row.connectionId ?? null,
        sql: row.sql,
        mapping: row.mapping,
        createdBy,
      });
    } else {
      const arr = this.memQueries.get(integratorId) ?? [];
      arr.unshift(row);
      this.memQueries.set(integratorId, arr);
    }

    // Push into the ingestion registry immediately.
    this.sql.registerQuery({
      id: row.queryKey,
      sql: row.sql,
      mapping: row.mapping,
    });

    return memToQueryRecord(row);
  }

  async updateQuery(
    integratorId: string,
    id: string,
    dto: NamedQueryUpdateDto,
  ): Promise<NamedQueryRecord> {
    const existing = await this.findQueryInternal(integratorId, id);
    if (!existing) throw new NotFoundException(`Named query not found: ${id}`);
    if (dto.sql !== undefined) assertReadOnly(dto.sql);
    const merged: QueryMem = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      description:
        dto.description === null ? null : (dto.description?.trim() ?? existing.description),
      connectionId:
        dto.connectionId === null ? null : (dto.connectionId?.trim() ?? existing.connectionId),
      sql: dto.sql ?? existing.sql,
      mapping: dto.mapping ?? existing.mapping,
      updatedAt: new Date().toISOString(),
    };

    if (this.db) {
      await this.db
        .update(queriesTable)
        .set({
          name: merged.name,
          description: merged.description ?? null,
          connectionId: merged.connectionId ?? null,
          sql: merged.sql,
          mapping: merged.mapping,
          updatedAt: new Date(),
        })
        .where(and(eq(queriesTable.integratorId, integratorId), eq(queriesTable.id, id)));
    } else {
      const arr = this.memQueries.get(integratorId) ?? [];
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr[idx] = merged;
    }

    // Refresh ingestion registry.
    this.sql.registerQuery({
      id: merged.queryKey,
      sql: merged.sql,
      mapping: merged.mapping,
    });

    return memToQueryRecord(merged);
  }

  async removeQuery(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      await this.db
        .delete(queriesTable)
        .where(and(eq(queriesTable.integratorId, integratorId), eq(queriesTable.id, id)));
      return true;
    }
    const arr = this.memQueries.get(integratorId) ?? [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  private async findQueryInternal(integratorId: string, id: string): Promise<QueryMem | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(queriesTable)
        .where(and(eq(queriesTable.integratorId, integratorId), eq(queriesTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        integratorId: r.integratorId,
        queryKey: r.queryKey,
        name: r.name,
        description: r.description,
        connectionId: r.connectionId,
        sql: r.sql,
        mapping: r.mapping as QueryMapping,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        createdBy: r.createdBy ?? undefined,
      };
    }
    return (this.memQueries.get(integratorId) ?? []).find((r) => r.id === id) ?? null;
  }
}

function rowToConnSummary(r: typeof connsTable.$inferSelect): ConnectionSummary {
  return {
    id: r.id,
    name: r.name,
    dialect: r.dialect as SqlDialect,
    ssl: r.ssl,
    maxRows: r.maxRows,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  };
}
function memToConnSummary(r: ConnectionMem): ConnectionSummary {
  return {
    id: r.id,
    name: r.name,
    dialect: r.dialect,
    ssl: r.ssl,
    maxRows: r.maxRows,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt ?? null,
  };
}
function rowToQuerySummary(r: typeof queriesTable.$inferSelect): NamedQuerySummary {
  return {
    id: r.id,
    queryKey: r.queryKey,
    name: r.name,
    description: r.description,
    connectionId: r.connectionId,
    createdAt: r.createdAt.toISOString(),
  };
}
function memToQuerySummary(r: QueryMem): NamedQuerySummary {
  return {
    id: r.id,
    queryKey: r.queryKey,
    name: r.name,
    description: r.description ?? null,
    connectionId: r.connectionId ?? null,
    createdAt: r.createdAt,
  };
}
function memToQueryRecord(r: QueryMem): NamedQueryRecord {
  return {
    ...memToQuerySummary(r),
    sql: r.sql,
    mapping: r.mapping,
  };
}
