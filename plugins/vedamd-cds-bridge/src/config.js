/**
 * Bridge configuration, read once at startup from the environment.
 *
 * Everything is explicit and fails fast: a bridge that starts with a
 * missing API key would return 401s from VedaMD that surface inside the
 * EMR as "no decision support available", which reads to a clinician as
 * "no safety problems found".
 */

const REQUIRED = ['VEDAMD_API_KEY'];

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Refusing to start — a bridge without a key returns 401s that look like "no alerts" in the EMR.',
    );
  }

  const upstream = (env.VEDAMD_BASE_URL ?? 'https://api.vedamd.io').replace(/\/+$/, '');
  if (!upstream.startsWith('https://') && !env.VEDAMD_ALLOW_INSECURE) {
    throw new Error(
      `VEDAMD_BASE_URL must be https (got ${upstream}). Set VEDAMD_ALLOW_INSECURE=1 only for local testing.`,
    );
  }

  return {
    upstream,
    apiKey: env.VEDAMD_API_KEY,
    port: Number(env.PORT ?? 8088),
    host: env.HOST ?? '0.0.0.0',
    /** Upstream request timeout. Must stay well under the EMR's own
     *  timeout so a slow CDS call degrades to "no cards", not a hung
     *  prescribing screen. */
    timeoutMs: Number(env.VEDAMD_TIMEOUT_MS ?? 4000),
    /** Comma-separated CIDR-free allow-list of caller IPs; empty = allow all
     *  (appropriate when the bridge only listens on a private network). */
    allowedCallers: (env.BRIDGE_ALLOWED_CALLERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Optional shared secret the EMR must present as X-Bridge-Token. */
    bridgeToken: env.BRIDGE_TOKEN ?? null,
    /** Browser origins allowed to call the bridge (CORS). Needed only for
     *  in-browser callers such as the DHIS2 app; server-side EMRs send no
     *  Origin header and are unaffected. Exact matches, comma-separated. */
    allowedOrigins: (env.BRIDGE_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
