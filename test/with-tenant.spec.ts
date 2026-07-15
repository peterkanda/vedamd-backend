import { describe, expect, it, vi } from 'vitest';
import { withTenant, type Drizzle } from '../src/db/database.module';

/**
 * C4: withTenant is the mechanism that makes Postgres RLS real — it opens a
 * transaction and sets the `app.integrator_id` GUC (SET LOCAL) before running
 * the caller's queries, so the DB enforces tenant isolation even if an
 * application WHERE clause is missing. This locks that behaviour; full
 * adoption across services is validated separately against a live database.
 */
describe('withTenant', () => {
  it('sets app.integrator_id inside the transaction before the callback runs', async () => {
    const order: string[] = [];
    const execute = vi.fn(async () => {
      order.push('set_config');
    });
    const tx = { execute } as unknown as Drizzle;
    const db = {
      transaction: async (cb: (tx: Drizzle) => Promise<unknown>) => cb(tx),
    } as unknown as Drizzle;

    const result = await withTenant(db, 'tenant-A', async (t) => {
      expect(t).toBe(tx);
      order.push('callback');
      return 'done';
    });

    expect(result).toBe('done');
    expect(execute).toHaveBeenCalledOnce();
    // GUC must be set before the callback issues any query.
    expect(order).toEqual(['set_config', 'callback']);
    // The executed statement carries the integrator id as a bound param.
    const calls = execute.mock.calls as unknown as unknown[][];
    const stmt = calls[0]?.[0];
    expect(JSON.stringify(stmt)).toContain('tenant-A');
    expect(JSON.stringify(stmt)).toContain('app.integrator_id');
  });
});
