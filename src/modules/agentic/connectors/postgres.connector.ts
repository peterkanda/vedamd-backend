import { Injectable } from '@nestjs/common';
import { assertReadOnly, type SqlConnectionConfig, type SqlConnector } from './sql-connector.types';

/**
 * Postgres connector — uses the `postgres` driver already in the
 * project. Read-only, parameterised, capped row count.
 *
 * Named-parameter syntax (:name) is rewritten to positional ($1...)
 * to match the driver's tagged-template / unsafe API.
 */
@Injectable()
export class PostgresConnector implements SqlConnector {
  readonly dialect = 'postgres' as const;

  isAvailable(): boolean {
    try {
      require.resolve('postgres');
      return true;
    } catch {
      return false;
    }
  }

  async query(
    config: SqlConnectionConfig,
    sql: string,
    params: Record<string, string | number>,
  ): Promise<Array<Record<string, unknown>>> {
    assertReadOnly(sql);

    const postgres = require('postgres') as (
      url: string,
      opts?: unknown,
    ) => {
      unsafe: (q: string, p: unknown[]) => Promise<Array<Record<string, unknown>>>;
      end: () => Promise<void>;
    };
    const { text, values } = toPositional(sql, params);
    const maxRows = config.maxRows ?? 200;
    const client = postgres(config.url, {
      ssl: config.ssl ? 'require' : undefined,
      max: 1,
      idle_timeout: 5,
      max_lifetime: 30,
    });
    try {
      const rows = await client.unsafe(text, values);
      return rows.slice(0, maxRows);
    } finally {
      await client.end();
    }
  }
}

/** Rewrite :named params to $1,$2,... and produce the ordered value list. */
function toPositional(
  sql: string,
  params: Record<string, string | number>,
): { text: string; values: Array<string | number> } {
  const values: Array<string | number> = [];
  const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
    if (!(name in params)) {
      throw new Error(`Missing bound parameter :${name}`);
    }
    values.push(params[name]);
    return `$${values.length}`;
  });
  return { text, values };
}
