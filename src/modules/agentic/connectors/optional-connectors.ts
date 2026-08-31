import { Injectable } from '@nestjs/common';
import { assertReadOnly, type SqlConnectionConfig, type SqlConnector } from './sql-connector.types';

/**
 * Optional SQL connectors — MySQL, MSSQL, Oracle.
 *
 * These lazy-load their drivers at runtime so the base image stays
 * lean. If the driver isn't installed, isAvailable() returns false +
 * query() throws a clear "npm install <driver>" message. This lets
 * VedaMD ship with Postgres support out-of-the-box and the heavier
 * enterprise drivers as opt-in peer dependencies.
 *
 *   MySQL  → npm install mysql2
 *   MSSQL  → npm install mssql
 *   Oracle → npm install oracledb
 */

function driverAvailable(mod: string): boolean {
  try {
    require.resolve(mod);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class MysqlConnector implements SqlConnector {
  readonly dialect = 'mysql' as const;
  isAvailable(): boolean {
    return driverAvailable('mysql2/promise');
  }
  async query(
    config: SqlConnectionConfig,
    sql: string,
    params: Record<string, string | number>,
  ): Promise<Array<Record<string, unknown>>> {
    assertReadOnly(sql);
    if (!this.isAvailable()) {
      throw new Error('MySQL connector requires the optional driver: npm install mysql2');
    }

    const mysql = require('mysql2/promise') as {
      createConnection: (opts: unknown) => Promise<{
        execute: (q: string, p: unknown[]) => Promise<[Array<Record<string, unknown>>, unknown]>;
        end: () => Promise<void>;
      }>;
    };
    const { text, values } = toQuestion(sql, params);
    const conn = await mysql.createConnection(
      config.ssl ? { uri: config.url, ssl: {} } : { uri: config.url },
    );
    try {
      const [rows] = await conn.execute(text, values);
      return (rows as Array<Record<string, unknown>>).slice(0, config.maxRows ?? 200);
    } finally {
      await conn.end();
    }
  }
}

@Injectable()
export class MssqlConnector implements SqlConnector {
  readonly dialect = 'mssql' as const;
  isAvailable(): boolean {
    return driverAvailable('mssql');
  }
  async query(
    config: SqlConnectionConfig,
    sql: string,
    params: Record<string, string | number>,
  ): Promise<Array<Record<string, unknown>>> {
    assertReadOnly(sql);
    if (!this.isAvailable()) {
      throw new Error('MSSQL connector requires the optional driver: npm install mssql');
    }

    const sqlPkg = require('mssql') as {
      connect: (url: string) => Promise<{
        request: () => {
          input: (name: string, val: unknown) => unknown;
          query: (q: string) => Promise<{ recordset: Array<Record<string, unknown>> }>;
        };
        close: () => Promise<void>;
      }>;
    };
    // mssql uses @name parameter syntax — keep :name → @name.
    const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '@$1');
    const pool = await sqlPkg.connect(config.url);
    try {
      const request = pool.request();
      for (const [k, v] of Object.entries(params)) request.input(k, v);
      const result = await request.query(text);
      return result.recordset.slice(0, config.maxRows ?? 200);
    } finally {
      await pool.close();
    }
  }
}

@Injectable()
export class OracleConnector implements SqlConnector {
  readonly dialect = 'oracle' as const;
  isAvailable(): boolean {
    return driverAvailable('oracledb');
  }
  async query(
    config: SqlConnectionConfig,
    sql: string,
    params: Record<string, string | number>,
  ): Promise<Array<Record<string, unknown>>> {
    assertReadOnly(sql);
    if (!this.isAvailable()) {
      throw new Error('Oracle connector requires the optional driver: npm install oracledb');
    }

    const oracledb = require('oracledb') as {
      OBJECT: number;
      getConnection: (opts: unknown) => Promise<{
        execute: (
          q: string,
          binds: Record<string, unknown>,
          opts: { outFormat: number; maxRows: number },
        ) => Promise<{ rows?: Array<Record<string, unknown>> }>;
        close: () => Promise<void>;
      }>;
    };
    // Oracle uses :name natively — no rewrite needed.
    const conn = await oracledb.getConnection({ connectString: config.url });
    try {
      const result = await conn.execute(sql, params, {
        outFormat: oracledb.OBJECT,
        maxRows: config.maxRows ?? 200,
      });
      return result.rows ?? [];
    } finally {
      await conn.close();
    }
  }
}

/** Rewrite :named to ? positional, returning ordered values (MySQL). */
function toQuestion(
  sql: string,
  params: Record<string, string | number>,
): { text: string; values: Array<string | number> } {
  const values: Array<string | number> = [];
  const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
    if (!(name in params)) throw new Error(`Missing bound parameter :${name}`);
    values.push(params[name]);
    return '?';
  });
  return { text, values };
}
