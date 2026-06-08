import { describe, expect, it } from 'vitest';
import { PhiFreeLogger } from '../src/common/phi-free-logger';

describe('PhiFreeLogger', () => {
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

  // Regression: these LLM-provider diagnostics must stay allow-listed so a
  // provider failure logs cleanly instead of having the logger throw and mask
  // the real "OpenAI API error: HTTP 4xx" with a phi-free-logger violation.
  it('allows LLM provider call diagnostics through unchanged', () => {
    const log = new PhiFreeLogger({ service: 'test', hashSecret: 's', strict: true });
    expect(() =>
      log.warn('agentic_llm_error', {
        llm_provider: 'openai',
        status_code: 429,
        attempt: 3,
        retryable: false,
        quota_exhausted: true,
        compat: 'openai',
      }),
    ).not.toThrow();
  });
});
