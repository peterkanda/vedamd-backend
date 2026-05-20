import { createHmac } from 'node:crypto';
import pino, { type Logger } from 'pino';

/**
 * PHI-free logger.
 *
 * Implements VedaMD's stateless promise at the observability layer
 * (NFR-027, NFR-028, NFR-029, FR-334, FR-335). Every log emitted by
 * the platform must pass through this wrapper. Direct use of `pino`,
 * `console.log`, or any other unwrapped logger is forbidden by lint /
 * code-review policy.
 *
 * Three guarantees:
 *
 *   1. Field allow-list. Only fields in `ALLOWED_FIELDS` may appear in
 *      a structured log entry. Any other key is dropped (production)
 *      or throws (test / development). This prevents accidental
 *      logging of FHIR resource fields, free-text patient data, or
 *      LLM prompts.
 *
 *   2. Identifier hashing. Any field whose name matches an
 *      identifier pattern (`patient_id`, `mrn`, `national_id`, etc.)
 *      is HMAC-SHA-256 hashed using a per-tenant secret before write.
 *      Plaintext identifiers never reach disk.
 *
 *   3. No request bodies. The wrapper has no `logRequest(body)` or
 *      similar API. Request bodies (CDS Hooks payloads, prefetch
 *      bundles) are structurally not loggable.
 */

export type SafeLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Permitted top-level field names in a structured log record. */
export const ALLOWED_FIELDS = new Set<string>([
  // request shape
  'request_id',
  'timestamp',
  'environment',
  'tenant_id',
  'integrator_id',
  'api_key_fingerprint',
  'endpoint',
  'hook',
  'method',
  'status_code',
  'latency_ms',
  'error_category',
  // rule evaluation
  'rule_id',
  'rule_version',
  'rules_evaluated',
  'fired',
  'cards_returned_count',
  'card_summaries',
  'citations',
  'evidence_level',
  // LLM
  'llm_invoked',
  'llm_provider',
  'llm_model',
  'llm_token_input',
  'llm_token_output',
  // agentic engine (counts + config ids only — never PHI)
  'agentic_card_count',
  'deterministic_card_count',
  'batch_item_count',
  'batch_evaluated',
  'batch_errored',
  'batch_critical_cards',
  'sql_dialect',
  'connection_id',
  'query_id',
  'row_count',
  // overrides
  'override_reported',
  'override_reason_code',
  // ops
  'service',
  'event',
  'message',
  'duration_ms',
  'component',
  'bundle_version',
  'bundle_signature',
  'bundle_verified',
  'bundle_status',
  'bundle_files',
  // hashed identifier carriers (already hashed by the wrapper)
  'actor_hash',
  'subject_hash',
]);

/** Field-name patterns that always carry identifiers and must be hashed. */
const IDENTIFIER_FIELDS = new Set<string>([
  'patient_id',
  'patient_mrn',
  'mrn',
  'national_id',
  'nhif_number',
  'phone',
  'phone_number',
  'email',
  'name',
  'given_name',
  'family_name',
  'practitioner_id',
  'user_id',
  'actor_id',
  'subject_id',
]);

const IDENTIFIER_HASH_SUFFIX = '_hash';

export interface PhiFreeLoggerOptions {
  service: string;
  /** Per-tenant secret used to HMAC identifiers. Required in production. */
  hashSecret: string;
  /** Strict mode throws on disallowed fields. Default: true outside production. */
  strict?: boolean;
  level?: SafeLogLevel;
}

export class PhiFreeLogger {
  private readonly logger: Logger;
  private readonly hashSecret: string;
  private readonly strict: boolean;
  private readonly service: string;

  constructor(opts: PhiFreeLoggerOptions) {
    this.service = opts.service;
    this.hashSecret = opts.hashSecret;
    this.strict = opts.strict ?? process.env.NODE_ENV !== 'production';
    this.logger = pino({
      level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
      base: { service: opts.service },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    });
  }

  trace(event: string, fields: Record<string, unknown> = {}) {
    this.emit('trace', event, fields);
  }
  debug(event: string, fields: Record<string, unknown> = {}) {
    this.emit('debug', event, fields);
  }
  info(event: string, fields: Record<string, unknown> = {}) {
    this.emit('info', event, fields);
  }
  warn(event: string, fields: Record<string, unknown> = {}) {
    this.emit('warn', event, fields);
  }
  error(event: string, fields: Record<string, unknown> = {}) {
    this.emit('error', event, fields);
  }
  fatal(event: string, fields: Record<string, unknown> = {}) {
    this.emit('fatal', event, fields);
  }

  /** HMAC-SHA-256 a single identifier value. Safe to call directly. */
  hashIdentifier(value: string, tenantSecret?: string): string {
    const secret = tenantSecret ?? this.hashSecret;
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private emit(level: SafeLogLevel, event: string, raw: Record<string, unknown>): void {
    const sanitized = this.sanitize(raw);
    this.logger[level]({ event, ...sanitized });
  }

  private sanitize(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (IDENTIFIER_FIELDS.has(key)) {
        if (typeof value !== 'string') {
          this.violate(`Identifier field '${key}' must be a string before hashing.`);
          continue;
        }
        out[`${key}${IDENTIFIER_HASH_SUFFIX}`] = this.hashIdentifier(value);
        continue;
      }
      if (!ALLOWED_FIELDS.has(key)) {
        this.violate(
          `Field '${key}' is not in the PHI-free logger allow-list. Update ALLOWED_FIELDS only after confirming the field cannot carry PHI.`,
        );
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  private violate(message: string): void {
    if (this.strict) throw new Error(`[phi-free-logger] ${message}`);
    this.logger.warn({ event: 'phi_free_logger_violation', component: this.service, message });
  }
}
