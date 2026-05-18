/**
 * Integration Log entry (FR-333). Strict field allow-list — anything
 * not on this type literally cannot be written. The type is the
 * compile-time half of the three-layer enforcement (TypeScript + runtime
 * + DB constraint).
 */
export interface IntegrationLogEntry {
  /** HMAC-SHA-256 of the request correlation id. */
  request_id: string;
  /** ISO 8601 UTC. */
  timestamp: string;
  environment: 'sandbox' | 'production';
  /** First 8 hex chars of HMAC(api_key). Never the raw key. */
  api_key_fingerprint: string;
  endpoint: string;
  hook?:
    | 'patient-view'
    | 'medication-prescribe'
    | 'order-sign'
    | 'appointment-book'
    | 'encounter-discharge';
  latency_ms: number;
  status_code: number;
  error_category: 'validation' | 'auth' | 'rate_limit' | 'internal' | 'downstream' | 'none';
  rules_evaluated: Array<{ rule_id: string; rule_version: string; fired: boolean }>;
  cards_returned_count: number;
  /** Card summary strings (RULE output, not patient data). */
  card_summaries: string[];
  citations: Array<{ label: string; url: string }>;
  llm_invoked: boolean;
  llm_provider: 'claude' | 'gpt' | 'llama-self-hosted' | 'ulizallama' | null;
  override_reported: boolean;
  override_reason_code?: string;
}

/**
 * The runtime enforcement set. Must match the type's keys exactly.
 * The compiler check `KeysMatch` ensures it stays in sync.
 */
export const INTEGRATION_LOG_ALLOWED_KEYS = [
  'request_id',
  'timestamp',
  'environment',
  'api_key_fingerprint',
  'endpoint',
  'hook',
  'latency_ms',
  'status_code',
  'error_category',
  'rules_evaluated',
  'cards_returned_count',
  'card_summaries',
  'citations',
  'llm_invoked',
  'llm_provider',
  'override_reported',
  'override_reason_code',
] as const satisfies ReadonlyArray<keyof IntegrationLogEntry>;

// Compile-time assertion: every key of IntegrationLogEntry must be in the array.
type _ExhaustiveKeys =
  Exclude<keyof IntegrationLogEntry, (typeof INTEGRATION_LOG_ALLOWED_KEYS)[number]> extends never
    ? true
    : ['INTEGRATION_LOG_ALLOWED_KEYS is missing keys from IntegrationLogEntry'];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustive: _ExhaustiveKeys = true;
