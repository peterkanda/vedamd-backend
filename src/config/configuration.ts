import { randomBytes } from 'node:crypto';

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
  database: {
    /** Postgres connection string. Empty in dev / unit tests; in-memory fallback used. */
    url: string;
    /** Max pool size. */
    poolMax: number;
    /** Require TLS to the database. Should be true for Supabase / any
     *  managed Postgres. */
    ssl: boolean;
  };
  content: {
    /** Directory of the active signed content bundle. */
    bundleDir: string;
    /** When true, any verification failure throws at boot (production default). */
    strictVerification: boolean;
    /** When true, refuse to load a bundle that contains any non-approved
     *  record. Production default; v0.1 dev bundle is all-draft, so this
     *  defaults to false outside production. */
    requireApproved: boolean;
    /**
     * When true, SNOMED CT codes are surfaced (terminology code system,
     * record `snomed` fields, and SNOMED card codings). Defaults to
     * FALSE: SNOMED CT redistribution requires an affiliate licence, so
     * the data ships in the bundle as future provision but stays hidden
     * at runtime until a licence is in place and this flag is enabled
     * via CONTENT_SNOMED_ENABLED=true.
     */
    snomedEnabled: boolean;
  };
  apiKeys: {
    /**
     * HMAC-SHA-256 secret used to fingerprint API key secrets at issue time
     * and on every inbound request. Only the fingerprint is stored
     * server-side; the secret itself is shown to the integrator exactly
     * once (FR-313).
     */
    fingerprintSecret: string;
  };
  identity: {
    /** OIDC issuer (e.g., https://id.vedamd.io). */
    issuer: string;
    /** JWKS URL for verifying access tokens (operator identity, FR-160). */
    jwksUrl: string;
    audience: string;
    /** JWT claim that holds the integrator_id (configurable per IdP). */
    integratorIdClaim: string;
    /**
     * Development-only bypass: when true AND NODE_ENV !== 'production',
     * the operator guard accepts `x-integrator-id` headers as identity.
     * Production refuses to honour this even if set.
     */
    devBypass: boolean;
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
    deepseekApiKey: string;
    geminiApiKey: string;
  };
  /**
   * On-device model distribution (FR-148 — offline AI). vedamd.io hosts
   * the MedGemma 4B multimodal weights and always advertises the
   * "current" build so the mobile app can download once (online) and
   * then run the assistant fully offline. The weights themselves live
   * behind a CDN / object store; the backend only serves the signed
   * *manifest* (version, per-file URL + SHA-256 + size + runtime hints).
   */
  models: {
    /** Public base URL the mobile app downloads weight files from. */
    distributionBaseUrl: string;
    /** Active MedGemma build id, e.g. "medgemma-4b-it-q4_k_m". */
    medgemmaVersion: string;
    /** Quantisation tag surfaced to clients, e.g. "Q4_K_M". */
    medgemmaQuantization: string;
    /** GGUF weight file (llama.cpp runtime). */
    medgemmaModelFile: string;
    medgemmaModelSizeBytes: number;
    medgemmaModelSha256: string;
    /** Multimodal projector (vision) file paired with the GGUF. */
    medgemmaMmprojFile: string;
    medgemmaMmprojSizeBytes: number;
    medgemmaMmprojSha256: string;
    /** Native context window the build was compiled / tuned for. */
    medgemmaContextLength: number;
    /** ISO date the build was published. */
    medgemmaReleasedAt: string;
    /** Lowest mobile app version that may run this build. */
    medgemmaMinAppVersion: string;
  };
  redis: {
    /**
     * Optional Redis connection string for shared cache + rate-limit
     * coordination. Absent in dev / unit tests; an in-process LRU is
     * used instead. The cache only carries derived, recomputable
     * server artefacts — never PHI.
     */
    url: string;
    /** Default TTL for deterministic CDS evaluation results, in seconds. */
    cdsEvaluateTtlSeconds: number;
  };
  http: {
    /** Maximum request body size in bytes. Default 1 MB. */
    bodyLimitBytes: number;
    /** Disable Swagger UI in production unless explicitly enabled. */
    exposeDocs: boolean;
  };
}

const STATELESS_EXTENSION_URL = 'http://vedamd.io/CapabilityStatement/stateless';

function cap(value: number, limit: number, label: string): number {
  if (value > limit) {
    throw new Error(`[config] ${label} cannot exceed ${limit} (SRS hard ceiling). Got: ${value}.`);
  }
  return value;
}

/**
 * Resolve a production-required secret with a safe fallback path.
 *
 * Behaviour:
 *   - env var present → use it (the correct production configuration).
 *   - env var missing in dev → use a stable placeholder so unit tests +
 *     local dev are reproducible.
 *   - env var missing in production → generate a per-process random
 *     secret (32 bytes hex) and emit a loud CRITICAL log to stderr. Boot
 *     SUCCEEDS so the deploy is unblocked, but cross-restart correlation
 *     for hashed identifiers (audit chain, PHI-free log identifiers,
 *     API key fingerprints issued before this boot) is lost on every
 *     restart until the env var is set permanently.
 *
 * This trades fail-fast safety for deploy resilience. The NFR-029 /
 * FR-313 promise — secrets are never hardcoded and PHI is never stored
 * in plaintext — is preserved either way; only stability across
 * restarts is degraded when the env var is missing.
 */
function resolveSecret(envName: string, devPlaceholder: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== 'production') return devPlaceholder;
  const ephemeral = randomBytes(32).toString('hex');
  // eslint-disable-next-line no-console
  console.error(
    `[config] CRITICAL: ${envName} is not set in production. Generated an ephemeral ` +
      `per-process secret so boot can proceed. Cross-restart correlation will break ` +
      `until you set ${envName} as a persistent environment variable.`,
  );
  return ephemeral;
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
    hashSecret: resolveSecret('AUDIT_HASH_SECRET', 'dev-only-do-not-use-in-prod'),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
    poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl:
      process.env.DATABASE_SSL !== undefined
        ? process.env.DATABASE_SSL === 'true'
        : process.env.NODE_ENV === 'production',
  },
  content: {
    bundleDir: process.env.CONTENT_BUNDLE_DIR ?? 'content/bundles/v0.1.0',
    strictVerification:
      process.env.CONTENT_STRICT_VERIFICATION !== undefined
        ? process.env.CONTENT_STRICT_VERIFICATION === 'true'
        : process.env.NODE_ENV === 'production',
    // Defaults to OFF in every environment because the v0.1 bundle that
    // ships in the repo is entirely draft records. Set
    // CONTENT_REQUIRE_APPROVED=true in production once the bundle's
    // editorial review status has been promoted from draft → approved.
    requireApproved: process.env.CONTENT_REQUIRE_APPROVED === 'true',
    snomedEnabled: process.env.CONTENT_SNOMED_ENABLED === 'true',
  },
  apiKeys: {
    fingerprintSecret: resolveSecret('API_KEY_FINGERPRINT_SECRET', 'dev-only-do-not-use-in-prod'),
  },
  identity: {
    issuer: process.env.OIDC_ISSUER ?? '',
    jwksUrl: process.env.OIDC_JWKS_URL ?? '',
    audience: process.env.OIDC_AUDIENCE ?? 'vedamd-api',
    integratorIdClaim: process.env.OIDC_INTEGRATOR_ID_CLAIM ?? 'integrator_id',
    devBypass:
      process.env.NODE_ENV !== 'production' && process.env.OPERATOR_AUTH_DEV_BYPASS === 'true',
  },
  integrationLog: {
    maxEntriesPerIntegrator: cap(
      Number(process.env.INTEGRATION_LOG_MAX_ENTRIES ?? 50_000),
      50_000,
      'INTEGRATION_LOG_MAX_ENTRIES',
    ),
    ttlDays: cap(
      Number(process.env.INTEGRATION_LOG_TTL_DAYS ?? 30),
      30,
      'INTEGRATION_LOG_TTL_DAYS',
    ),
  },
  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  },
  models: {
    distributionBaseUrl: process.env.MODELS_DISTRIBUTION_BASE_URL ?? 'https://models.vedamd.io',
    medgemmaVersion: process.env.MEDGEMMA_VERSION ?? 'medgemma-4b-it-q4_k_m',
    medgemmaQuantization: process.env.MEDGEMMA_QUANTIZATION ?? 'Q4_K_M',
    medgemmaModelFile: process.env.MEDGEMMA_MODEL_FILE ?? 'medgemma-4b-it-Q4_K_M.gguf',
    medgemmaModelSizeBytes: Number(process.env.MEDGEMMA_MODEL_SIZE_BYTES ?? 2_900_000_000),
    medgemmaModelSha256: process.env.MEDGEMMA_MODEL_SHA256 ?? '',
    medgemmaMmprojFile: process.env.MEDGEMMA_MMPROJ_FILE ?? 'medgemma-4b-it-mmproj-f16.gguf',
    medgemmaMmprojSizeBytes: Number(process.env.MEDGEMMA_MMPROJ_SIZE_BYTES ?? 850_000_000),
    medgemmaMmprojSha256: process.env.MEDGEMMA_MMPROJ_SHA256 ?? '',
    medgemmaContextLength: Number(process.env.MEDGEMMA_CONTEXT_LENGTH ?? 4096),
    medgemmaReleasedAt: process.env.MEDGEMMA_RELEASED_AT ?? '2026-06-01T00:00:00.000Z',
    medgemmaMinAppVersion: process.env.MEDGEMMA_MIN_APP_VERSION ?? '0.1.0',
  },
  redis: {
    url: process.env.REDIS_URL ?? '',
    cdsEvaluateTtlSeconds: Number(process.env.REDIS_CDS_TTL_SECONDS ?? 60),
  },
  http: {
    bodyLimitBytes: Number(process.env.HTTP_BODY_LIMIT_BYTES ?? 1_048_576),
    exposeDocs:
      process.env.HTTP_EXPOSE_DOCS !== undefined
        ? process.env.HTTP_EXPOSE_DOCS === 'true'
        : process.env.NODE_ENV !== 'production',
  },
});
