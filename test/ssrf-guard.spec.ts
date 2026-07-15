import { describe, it, expect } from 'vitest';
import {
  assertHostAllowedLiteral,
  assertHostAllowedResolved,
  extractHost,
  SsrfBlockedError,
} from '../src/common/ssrf-guard';

describe('ssrf-guard extractHost', () => {
  it('pulls host from connection URLs', () => {
    expect(extractHost('postgresql://user:pw@db.example.com:5432/app')).toBe('db.example.com');
    expect(extractHost('mysql://10.0.0.1/db')).toBe('10.0.0.1');
    expect(extractHost('smtp.example.com:587')).toBe('smtp.example.com');
    expect(extractHost('[::1]:25')).toBe('::1');
  });
});

describe('assertHostAllowedLiteral', () => {
  it('allows ordinary public hosts', () => {
    expect(() => assertHostAllowedLiteral('postgresql://user:pw@db.example.com/app')).not.toThrow();
    expect(() => assertHostAllowedLiteral('smtp.sendgrid.net')).not.toThrow();
  });

  it('allows non-resolvable bare hostnames structurally (DNS check is separate)', () => {
    expect(() => assertHostAllowedLiteral('postgresql://x')).not.toThrow();
  });

  it('blocks loopback and internal hostnames', () => {
    expect(() => assertHostAllowedLiteral('postgresql://user@localhost/app')).toThrow(
      SsrfBlockedError,
    );
    expect(() => assertHostAllowedLiteral('mysql://db.internal/app')).toThrow(SsrfBlockedError);
    expect(() => assertHostAllowedLiteral('postgres://svc.local/app')).toThrow(SsrfBlockedError);
  });

  it('blocks private + link-local + metadata IP literals', () => {
    for (const url of [
      'postgresql://10.0.0.5/app',
      'postgresql://192.168.1.10/app',
      'postgresql://172.16.0.1/app',
      'postgresql://127.0.0.1/app',
      'postgresql://169.254.169.254/app', // cloud metadata
      'mysql://[::1]/db',
    ]) {
      expect(() => assertHostAllowedLiteral(url), url).toThrow(SsrfBlockedError);
    }
  });

  it('blocks obfuscated loopback encodings (H4 bypass vectors)', () => {
    for (const url of [
      'http://2130706433/',            // 127.0.0.1 as a decimal integer
      'http://0x7f000001/',            // hex integer
      'http://017700000001/',          // octal integer
      'http://0x7f.0.0.1/',            // hex first octet
      'http://0177.0.0.1/',            // octal first octet
      'postgresql://[::ffff:7f00:1]/app', // hex IPv4-mapped IPv6 loopback
      'http://[::ffff:a9fe:a9fe]/',    // hex-mapped 169.254.169.254 metadata
    ]) {
      expect(() => assertHostAllowedLiteral(url), url).toThrow(SsrfBlockedError);
    }
  });

  it('permits private hosts when blockPrivate is false', () => {
    expect(() =>
      assertHostAllowedLiteral('postgresql://10.0.0.5/app', { blockPrivate: false }),
    ).not.toThrow();
  });

  it('enforces an allowlist when configured', () => {
    const opts = { allowlist: ['example.com'] };
    expect(() => assertHostAllowedLiteral('postgresql://db.example.com/app', opts)).not.toThrow();
    expect(() => assertHostAllowedLiteral('postgresql://evil.com/app', opts)).toThrow(
      SsrfBlockedError,
    );
  });
});

describe('assertHostAllowedResolved', () => {
  it('blocks an IP literal in a private range without DNS', async () => {
    await expect(assertHostAllowedResolved('postgresql://169.254.169.254/app')).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it('rejects a host that cannot be resolved', async () => {
    await expect(
      assertHostAllowedResolved('postgresql://nonexistent.invalid/app'),
    ).rejects.toThrow(SsrfBlockedError);
  });
});
