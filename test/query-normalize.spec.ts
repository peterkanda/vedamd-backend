import { describe, expect, it } from 'vitest';
import { collapseQueryArrays } from '../src/common/query-normalize';

describe('collapseQueryArrays (G10: duplicate query params no longer 500)', () => {
  it('keeps the last value of a repeated key', () => {
    const q: Record<string, unknown> = { q: ['malaria', 'fever'] };
    collapseQueryArrays(q);
    expect(q.q).toBe('fever');
    expect(typeof (q.q as string).toLowerCase).toBe('function');
  });

  it('leaves single-valued params untouched', () => {
    const q: Record<string, unknown> = { q: 'malaria', domain: 'infectious' };
    collapseQueryArrays(q);
    expect(q).toEqual({ q: 'malaria', domain: 'infectious' });
  });

  it('handles an empty array by dropping the value', () => {
    const q: Record<string, unknown> = { q: [] };
    collapseQueryArrays(q);
    expect(q.q).toBeUndefined();
  });

  it('is a no-op for non-object input', () => {
    expect(() => collapseQueryArrays(undefined)).not.toThrow();
    expect(() => collapseQueryArrays('x')).not.toThrow();
  });
});
