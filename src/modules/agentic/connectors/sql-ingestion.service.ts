import { Inject, Injectable, Logger } from '@nestjs/common';
import { PostgresConnector } from './postgres.connector';
import { MysqlConnector, MssqlConnector, OracleConnector } from './optional-connectors';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../../common/phi-free-logger';
import type {
  NamedQuery,
  QueryMapping,
  SqlConnectionConfig,
  SqlConnector,
  SqlDialect,
} from './sql-connector.types';
import type { AgenticClinicalContext } from '../agentic.types';
import { SCHEMA_PRESETS } from './schema-presets';

/**
 * SQL ingestion service — pull-mode.
 *
 * Operators register connections + named queries via env-configured
 * JSON (AGENTIC_SQL_CONNECTIONS, AGENTIC_SQL_QUERIES). Clients then
 * call POST /agentic/evaluate-sql with a connectionId + queryId +
 * bound params. The service:
 *   1. looks up the connection + query (rejects unknown ids)
 *   2. runs the read-only parameterised SELECT
 *   3. maps rows to AgenticClinicalContext via the query's mapping
 *   4. returns the context for evaluation
 *
 * Rows are never logged or persisted. Statelessness preserved.
 */
@Injectable()
export class SqlIngestionService {
  private readonly nestLogger = new Logger(SqlIngestionService.name);
  private readonly connections = new Map<string, SqlConnectionConfig>();
  private readonly queries = new Map<string, NamedQuery>();
  private readonly connectors: Record<SqlDialect, SqlConnector>;

  constructor(
    pg: PostgresConnector,
    mysql: MysqlConnector,
    mssql: MssqlConnector,
    oracle: OracleConnector,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.connectors = { postgres: pg, mysql, mssql, oracle };
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    // When AGENTIC_SQL_REGISTER_PRESETS=true, schema-preset queries are
    // registered as usable named queries (still require a configured
    // connection to run). Off by default — presets are templates to
    // adapt, not turnkey, so opt-in avoids running an unverified query
    // against a mismatched schema.
    if (process.env.AGENTIC_SQL_REGISTER_PRESETS === 'true') {
      for (const p of SCHEMA_PRESETS) this.queries.set(p.query.id, p.query);
    }
    try {
      const conns = JSON.parse(process.env.AGENTIC_SQL_CONNECTIONS ?? '[]') as SqlConnectionConfig[];
      for (const c of conns) this.connections.set(c.id, c);
    } catch {
      this.nestLogger.warn('AGENTIC_SQL_CONNECTIONS is not valid JSON — pull-mode connections disabled.');
    }
    try {
      const queries = JSON.parse(process.env.AGENTIC_SQL_QUERIES ?? '[]') as NamedQuery[];
      for (const q of queries) this.queries.set(q.id, q);
    } catch {
      this.nestLogger.warn('AGENTIC_SQL_QUERIES is not valid JSON — pull-mode queries disabled.');
    }
  }

  /** Register at runtime (used by tests + admin API). */
  registerConnection(c: SqlConnectionConfig): void {
    this.connections.set(c.id, c);
  }
  registerQuery(q: NamedQuery): void {
    this.queries.set(q.id, q);
  }

  availability(): Record<SqlDialect, boolean> {
    return {
      postgres: this.connectors.postgres.isAvailable(),
      mysql: this.connectors.mysql.isAvailable(),
      mssql: this.connectors.mssql.isAvailable(),
      oracle: this.connectors.oracle.isAvailable(),
    };
  }

  /**
   * Public lookup used by other modules (clinical-audits) that need
   * the raw query + mapping but their own row-walking strategy.
   * Returns null if either id is unregistered.
   */
  getRegisteredQuery(queryId: string): NamedQuery | null {
    return this.queries.get(queryId) ?? null;
  }
  getRegisteredConnection(connectionId: string): SqlConnectionConfig | null {
    return this.connections.get(connectionId) ?? null;
  }

  /**
   * Execute a registered named query and return the raw rows.
   * Used by the clinical-audits module which evaluates rules per-row
   * (the existing `buildContext` aggregates all rows into one patient
   * context, which is right for CDS but wrong for audit sweeps).
   * Still subject to the connector's read-only guard.
   */
  async fetchRows(
    connectionId: string,
    queryId: string,
    params: Record<string, string | number>,
  ): Promise<{ rows: Array<Record<string, unknown>>; mapping: QueryMapping }> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connectionId: ${connectionId}`);
    const query = this.queries.get(queryId);
    if (!query) throw new Error(`Unknown queryId: ${queryId}`);
    const connector = this.connectors[connection.dialect];
    const rows = await connector.query(connection, query.sql, params);
    this.log.info('agentic_sql_fetched_for_audit', {
      connection_id: connectionId,
      dialect: connection.dialect,
      query_id: queryId,
      row_count: rows.length,
    });
    return { rows, mapping: query.mapping };
  }

  async buildContext(
    connectionId: string,
    queryId: string,
    params: Record<string, string | number>,
    hook?: string,
    question?: string,
  ): Promise<AgenticClinicalContext> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connectionId: ${connectionId}`);
    const query = this.queries.get(queryId);
    if (!query) throw new Error(`Unknown queryId: ${queryId}`);

    const connector = this.connectors[connection.dialect];
    if (!connector.isAvailable()) {
      throw new Error(`Driver for dialect '${connection.dialect}' is not installed.`);
    }

    const rows = await connector.query(connection, query.sql, params);
    this.log.info('agentic_sql_ingested', {
      sql_dialect: connection.dialect,
      connection_id: connectionId,
      query_id: queryId,
      row_count: rows.length,
    });
    return mapRows(rows, query.mapping, hook, question);
  }
}

/** Map result rows to AgenticClinicalContext per the declarative mapping. */
function mapRows(
  rows: Array<Record<string, unknown>>,
  mapping: QueryMapping,
  hook?: string,
  question?: string,
): AgenticClinicalContext {
  const ctx: AgenticClinicalContext = { hook, question };

  // Patient fields read from the first row.
  if (mapping.patient && rows[0]) {
    const first = rows[0];
    const p: NonNullable<AgenticClinicalContext['patient']> = {};
    for (const [field, col] of Object.entries(mapping.patient)) {
      const v = first[col];
      if (v == null) continue;
      if (field === 'sex') {
        const s = String(v).toLowerCase();
        if (s === 'male' || s === 'female' || s === 'other') p.sex = s;
      } else if (field === 'pregnant') {
        p.pregnant = v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === 'yes';
      } else {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n)) (p as Record<string, number>)[field] = n;
      }
    }
    if (Object.keys(p).length) ctx.patient = p;
  }

  const meds = new Set<string>();
  const dx = new Set<string>();
  const allergies = new Set<string>();
  const labs: NonNullable<AgenticClinicalContext['labs']> = [];

  for (const row of rows) {
    if (mapping.medicationColumn && row[mapping.medicationColumn] != null)
      meds.add(String(row[mapping.medicationColumn]));
    if (mapping.diagnosisColumn && row[mapping.diagnosisColumn] != null)
      dx.add(String(row[mapping.diagnosisColumn]));
    if (mapping.allergyColumn && row[mapping.allergyColumn] != null)
      allergies.add(String(row[mapping.allergyColumn]));
    if (mapping.lab?.valueColumn && row[mapping.lab.valueColumn] != null) {
      const raw = row[mapping.lab.valueColumn];
      const num = typeof raw === 'number' ? raw : Number(raw);
      labs.push({
        name: mapping.lab.nameColumn ? String(row[mapping.lab.nameColumn] ?? '') : undefined,
        code: mapping.lab.codeColumn ? String(row[mapping.lab.codeColumn] ?? '') : undefined,
        value: Number.isNaN(num) ? String(raw) : num,
        unit: mapping.lab.unitColumn ? String(row[mapping.lab.unitColumn] ?? '') : undefined,
      });
    }
  }

  if (meds.size) ctx.medications = [...meds];
  if (dx.size) ctx.diagnoses = [...dx];
  if (allergies.size) ctx.allergies = [...allergies];
  if (labs.length) ctx.labs = labs;
  return ctx;
}
