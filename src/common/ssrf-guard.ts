import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF protection for user-supplied connection targets (external SQL
 * database URLs, SMTP hosts). A tenant must never be able to point
 * VedaMD at an internal/loopback/link-local address — that would let
 * them reach our own metadata endpoint, internal services or the
 * database itself ("malicious links attacking our site").
 *
 * Two layers:
 *  - assertHostAllowedLiteral: synchronous, literal-only. Safe to call
 *    at registration time; does NOT resolve DNS, so a not-yet-resolvable
 *    hostname is allowed structurally.
 *  - assertHostAllowedResolved: asynchronous, resolves the host and
 *    blocks if ANY resolved address is private/reserved. Call this at
 *    actual connect/send time — it closes the DNS-rebinding hole.
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export interface SsrfOptions {
  /**
   * Host suffixes explicitly permitted. When non-empty, ONLY hosts that
   * equal one of these or are a dot-suffix of one are allowed (the
   * tenant's URL allowlist). When empty, any public host is allowed.
   */
  allowlist?: string[];
  /**
   * When false, private/loopback/link-local ranges are permitted — only
   * for self-hosted deployments on a trusted private network. Default
   * true (block them).
   */
  blockPrivate?: boolean;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost'];

/** Pull the bare hostname out of a URL or a raw host[:port] string. */
export function extractHost(urlOrHost: string): string {
  const s = urlOrHost.trim();
  try {
    const u = new URL(s.includes('://') ? s : `scheme://${s}`);
    return u.hostname.replace(/^\[|\]$/g, '');
  } catch {
    // Strip a trailing :port and any ipv6 brackets as a fallback.
    return s.replace(/^\[|\]$/g, '').replace(/:\d+$/, '');
  }
}

function isPrivateIpv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (o[0] === 0) return true; // "this" network
  if (o[0] === 127) return true; // loopback
  if (o[0] === 10) return true; // private
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // private
  if (o[0] === 192 && o[1] === 168) return true; // private
  if (o[0] === 169 && o[1] === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT
  return false;
}

/**
 * Canonicalise the many non-dotted encodings of an IPv4 address to the
 * dotted-quad form so the private-range check can't be bypassed:
 *   2130706433        (decimal integer)      → 127.0.0.1
 *   0x7f000001        (hex integer)          → 127.0.0.1
 *   017700000001      (octal integer)        → 127.0.0.1
 *   0x7f.0.0.1        (hex octet)            → 127.0.0.1
 *   0177.0.0.1        (octal octet)          → 127.0.0.1
 * Returns the original string unchanged when it is not one of these forms.
 */
export function canonicalizeIpv4(host: string): string {
  if (isIP(host) === 4) return host;
  const parseOctet = (p: string): number | null => {
    if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
    if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
    if (/^\d+$/.test(p)) return parseInt(p, 10);
    return null;
  };
  // Single-integer form (decimal / hex / octal).
  if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)) {
    const n = parseOctet(host);
    if (n !== null && n >= 0 && n <= 0xffffffff) {
      return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
    }
  }
  // Dotted form with hex/octal octets.
  const parts = host.split('.');
  if (parts.length === 4) {
    const nums = parts.map(parseOctet);
    if (nums.every((n) => n !== null && n >= 0 && n <= 255)) {
      return (nums as number[]).join('.');
    }
  }
  return host;
}

function isPrivateIp(ip: string): boolean {
  const canon = canonicalizeIpv4(ip);
  const kind = isIP(canon);
  if (kind === 4) return isPrivateIpv4(canon);
  if (kind === 6) {
    const lower = canon.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    // IPv4-mapped, dotted form: ::ffff:127.0.0.1
    const dotted = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotted) return isPrivateIpv4(dotted[1]);
    // IPv4-mapped/compatible, hex form: ::ffff:7f00:1 or ::7f00:1
    const hex = lower.match(/::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      return isPrivateIpv4(v4);
    }
    return false;
  }
  return false;
}

function matchesAllowlist(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((entry) => {
    const a = entry.trim().toLowerCase();
    if (!a) return false;
    return h === a || h.endsWith(`.${a}`);
  });
}

/** Read SSRF policy from the environment so callers without ConfigService
 *  (e.g. provider adapters) can share one source of truth. */
export function ssrfOptionsFromEnv(): SsrfOptions {
  const raw = process.env.SSRF_HOST_ALLOWLIST ?? '';
  const allowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Block private ranges unless explicitly opted out (self-hosted only).
  const blockPrivate = process.env.SSRF_BLOCK_PRIVATE !== 'false';
  return { allowlist, blockPrivate };
}

/** Synchronous literal check — no DNS. Use at registration time. */
export function assertHostAllowedLiteral(urlOrHost: string, opts: SsrfOptions = {}): void {
  const host = extractHost(urlOrHost);
  if (!host) throw new SsrfBlockedError('No host found in the connection target.');
  const lower = host.toLowerCase();
  const blockPrivate = opts.blockPrivate !== false;

  if (blockPrivate) {
    if (BLOCKED_HOSTNAMES.has(lower)) {
      throw new SsrfBlockedError(`Host "${host}" is not permitted (loopback/internal).`);
    }
    if (BLOCKED_SUFFIXES.some((suf) => lower.endsWith(suf))) {
      throw new SsrfBlockedError(`Host "${host}" is not permitted (internal domain).`);
    }
    // isPrivateIp canonicalises integer/octal/hex forms, so this also blocks
    // 2130706433, 0x7f000001, 0177.0.0.1 and ::ffff:7f00:1 — not just dotted
    // quads. A bare hostname (isPrivateIp returns false) falls through to the
    // DNS-aware resolved check.
    if (isPrivateIp(host)) {
      throw new SsrfBlockedError(`Host "${host}" is a private/reserved address.`);
    }
  }

  if (opts.allowlist && opts.allowlist.length > 0 && !matchesAllowlist(host, opts.allowlist)) {
    throw new SsrfBlockedError(
      `Host "${host}" is not on the allowed-hosts list. Add it to SSRF_HOST_ALLOWLIST.`,
    );
  }
}

/** Asynchronous DNS-aware check. Use at actual connect/send time. */
export async function assertHostAllowedResolved(
  urlOrHost: string,
  opts: SsrfOptions = {},
): Promise<void> {
  assertHostAllowedLiteral(urlOrHost, opts);
  if (opts.blockPrivate === false) return;
  const host = extractHost(urlOrHost);
  if (isIP(host)) return; // literal IP already validated above

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError(`Host "${host}" could not be resolved.`);
  }
  for (const a of addresses) {
    if (isPrivateIp(a.address)) {
      throw new SsrfBlockedError(
        `Host "${host}" resolves to a private/reserved address (${a.address}).`,
      );
    }
  }
}
