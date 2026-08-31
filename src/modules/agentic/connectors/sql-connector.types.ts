/**
 * SQL connector abstraction for pull-mode ingestion.
 *
 * SECURITY MODEL (critical):
 *   - Clients NEVER send raw SQL or raw connection strings. They send
 *     a connectionId + queryId that the operator has pre-configured
 *     server-side. This prevents SQL injection + credential leakage.
 *   - Named queries are parameterised; bound params are escaped by the
 *     driver. The query MUST be read-only (SELECT). The connector
 *     rejects any non-SELECT statement.
 *   - Results are mapped to AgenticClinicalContext and evaluated
 *     in-memory; rows are NEVER logged or persisted (stateless).
 */

export type SqlDialect = 'postgres' | 'mysql' | 'mssql' | 'oracle';

export interface SqlConnectionConfig {
  id: string;
  dialect: SqlDialect;
  /** Connection string / DSN — held server-side only. */
  url: string;
  /** Require TLS. */
  ssl?: boolean;
  /** Max rows a query may return (hard cap to bound memory). */
  maxRows?: number;
}

export interface NamedQuery {
  id: string;
  /** The parameterised SELECT. e.g. "SELECT ... WHERE encounter_id = :encounterId". */
  sql: string;
  /** Maps the result row(s) to AgenticClinicalContext fields. */
  mapping: QueryMapping;
}

/**
 * Declarative mapping from query result columns to the clinical
 * context. Avoids bespoke code per EHR — operators describe their
 * schema once.
 */
export interface QueryMapping {
  /** Column → patient.ageYears etc. Single-row patient fields. */
  patient?: Partial<
    Record<
      | 'ageYears'
      | 'ageMonths'
      | 'weightKg'
      | 'sex'
      | 'pregnant'
      | 'gestationWeeks'
      | 'eGFR'
      | 'creatinineUmolL',
      string
    >
  >;
  /** Column that holds a medication name/slug (rows aggregated). */
  medicationColumn?: string;
  /** Column that holds a diagnosis name/slug/ICD code. */
  diagnosisColumn?: string;
  /** Column that holds an allergy. */
  allergyColumn?: string;
  /** Lab mapping. */
  lab?: { nameColumn?: string; codeColumn?: string; valueColumn?: string; unitColumn?: string };
}

export interface SqlConnector {
  readonly dialect: SqlDialect;
  /** Whether the underlying driver is available (installed). */
  isAvailable(): boolean;
  /** Execute a read-only parameterised query; returns rows. */
  query(
    config: SqlConnectionConfig,
    sql: string,
    params: Record<string, string | number>,
  ): Promise<Array<Record<string, unknown>>>;
}

/** Guards a SQL string to read-only SELECT. Throws otherwise. */
export function assertReadOnly(sql: string): void {
  const normalised = sql.trim().replace(/^\(+/, '').toLowerCase();
  if (!normalised.startsWith('select') && !normalised.startsWith('with')) {
    throw new Error('Only read-only SELECT/WITH queries are permitted in pull-mode connectors.');
  }
  // Block stacked statements + obvious mutations.
  const forbidden =
    /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|exec|execute|call)\b/i;
  if (forbidden.test(sql)) {
    throw new Error(
      'Mutation / DDL / procedure keywords are not permitted in pull-mode connectors.',
    );
  }
  if (
    sql.includes(';') &&
    sql
      .trim()
      .replace(/;+\s*$/, '')
      .includes(';')
  ) {
    throw new Error('Stacked statements are not permitted in pull-mode connectors.');
  }
}
