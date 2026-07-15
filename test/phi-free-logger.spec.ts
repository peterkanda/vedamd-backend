import { describe, expect, it } from 'vitest';
import { PhiFreeLogger } from '../src/common/phi-free-logger';

/** Capture pino output lines for assertion. */
function capturing(): { log: PhiFreeLogger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = {
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  };
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 's', strict: false }, stream);
  return {
    log,
    lines: () => chunks.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}

describe('PhiFreeLogger', () => {
  it('hashes PHI nested inside an allow-listed container (H5: nested-field leak)', () => {
    const { log, lines } = capturing();
    log.info('cds_hook_evaluated', {
      card_summaries: { patientName: 'Jane Doe', mrn: '12345', title: 'Malaria' },
    });
    const out = lines()[0];
    const flat = JSON.stringify(out);
    // Raw PHI must not appear anywhere in the emitted line...
    expect(flat).not.toContain('Jane Doe');
    expect(flat).not.toContain('12345');
    // ...but the non-identifying content field survives.
    expect(flat).toContain('Malaria');
    // Nested identifiers are hashed under a *_hash key.
    const summaries = out.card_summaries as Record<string, unknown>;
    expect(summaries.patientName_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(summaries.mrn_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(summaries.title).toBe('Malaria');
  });

  it('hashes PHI nested inside arrays', () => {
    const { log, lines } = capturing();
    log.info('cds_hook_evaluated', {
      citations: [{ national_id: 'A123', detail: 'ok' }],
    });
    const flat = JSON.stringify(lines()[0]);
    expect(flat).not.toContain('A123');
    expect(flat).toContain('ok');
  });

  it('rejects fields not on the allow-list in strict mode', () => {
    const log = new PhiFreeLogger({ service: 'test', hashSecret: 's', strict: true });
    expect(() => log.info('test', { not_on_allowlist: 'x' })).toThrow(
      /not in the PHI-free logger allow-list/,
    );
  });

  it('hashes identifier fields with HMAC-SHA-256', () => {
    const log = new PhiFreeLogger({ service: 'test', hashSecret: 's', strict: true });
    const h1 = log.hashIdentifier('patient-123');
    const h2 = log.hashIdentifier('patient-123');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(h1).not.toContain('patient-123');
  });

  it('different tenant secrets produce different hashes for the same id', () => {
    const a = new PhiFreeLogger({ service: 'a', hashSecret: 'tenantA', strict: true });
    const b = new PhiFreeLogger({ service: 'b', hashSecret: 'tenantB', strict: true });
    expect(a.hashIdentifier('id-1')).not.toBe(b.hashIdentifier('id-1'));
  });

  it('allows known fields through unchanged', () => {
    const log = new PhiFreeLogger({ service: 'test', hashSecret: 's', strict: true });
    expect(() =>
      log.info('cds_hook_evaluated', {
        rule_id: 'r1',
        rule_version: '1.0.0',
        latency_ms: 12,
        status_code: 200,
        cards_returned_count: 0,
      }),
    ).not.toThrow();
  });
});
