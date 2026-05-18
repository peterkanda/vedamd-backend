export interface AppConfig {
  env: string;
  port: number;
  logLevel: string;
  stateless: {
    /** Brand promise. Compiled-in constant; not configurable. */
    declared: true;
    capabilityExtensionUrl: string;
  };
  audit: {
    /** HMAC-SHA-256 secret for hashing identifiers before any write (NFR-029). */
    hashSecret: string;
  };
  identity: {
    /** OIDC issuer (e.g., https://id.vedamd.io). */
    issuer: string;
    /** JWKS URL for verifying access tokens (operator identity, FR-160). */
    jwksUrl: string;
    audience: string;
  };
  integrationLog: {
    /** Hard ceiling per FR-331; cannot be raised above 50,000. */
    maxEntriesPerIntegrator: number;
    /** Hard ceiling per FR-332; cannot be raised above 30 days. */
    ttlDays: number;
  };
  llm: {
    anthropicApiKey: string;
    openaiApiKey: string;
  };
}

const STATELESS_EXTENSION_URL = 'http://vedamd.io/CapabilityStatement/stateless';

function cap(value: number, limit: number, label: string): number {
  if (value > limit) {
    throw new Error(
      `[config] ${label} cannot exceed ${limit} (SRS hard ceiling). Got: ${value}.`,
    );
  }
  return value;
}

export const configuration = (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  stateless: {
    declared: true,
    capabilityExtensionUrl: STATELESS_EXTENSION_URL,
  },
  audit: {
    hashSecret:
      process.env.AUDIT_HASH_SECRET ??
      (process.env.NODE_ENV === 'production'
        ? (() => {
            throw new Error('AUDIT_HASH_SECRET must be set in production (NFR-029).');
          })()
        : 'dev-only-do-not-use-in-prod'),
  },
  identity: {
    issuer: process.env.OIDC_ISSUER ?? '',
    jwksUrl: process.env.OIDC_JWKS_URL ?? '',
    audience: process.env.OIDC_AUDIENCE ?? 'vedamd-api',
  },
  integrationLog: {
    maxEntriesPerIntegrator: cap(
      Number(process.env.INTEGRATION_LOG_MAX_ENTRIES ?? 50_000),
      50_000,
      'INTEGRATION_LOG_MAX_ENTRIES',
    ),
    ttlDays: cap(Number(process.env.INTEGRATION_LOG_TTL_DAYS ?? 30), 30, 'INTEGRATION_LOG_TTL_DAYS'),
  },
  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  },
});
