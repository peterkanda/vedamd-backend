/**
 * What a clinical request contributes to the audit trail.
 *
 * Controllers stash this on the Fastify request; the global
 * `ClinicalAuditInterceptor` drains it after the response and writes both the
 * HMAC-chained ledger row and the per-integrator integration-log row. Going
 * through the request object rather than threading a correlation id through
 * five call chains keeps the clinical services' signatures unchanged, and lets
 * the interceptor supply what they cannot see: final status code, API-key
 * fingerprint, environment and true latency.
 *
 * Everything here is PHI-free by construction — counts, ids, versions and
 * model names. The clinician's question, the model's answer and card bodies
 * are deliberately absent and must stay that way: the audit trail records what
 * was decided and on what evidence, never the consultation itself. The
 * PHI-free logger's allow-list enforces this independently.
 */
export interface ClinicalAuditStash {
  /** Which clinical surface answered — picks the audit event type. */
  kind: 'cds' | 'agentic' | 'assistant' | 'reference';
  /** CDS service id or hook, where the surface has one. */
  serviceId?: string;
  hook?: string;
  /** Whether an LLM was called at all (false for deterministic-only). */
  llmInvoked: boolean;
  llmProvider?: string;
  llmModel?: string;
  /** Whether the answering model was operator-declared clinical-grade. */
  llmMedical?: boolean;
  /** Provider originally attempted, when the router fell back. */
  fellBackFrom?: string | null;
  /** Rules considered and whether each fired. */
  rulesEvaluated?: Array<{ rule_id: string; rule_version: string; fired: boolean }>;
  /** Card count and their one-line summaries (rule output, not patient data). */
  cardsReturned?: number;
  cardSummaries?: string[];
  /** Bundle records the answer cited, as `kind:id`. */
  citations?: Array<{ kind: string; id: string }>;
  /** Set when the clinical surface declined to answer, and why. */
  refusedReason?: string;
  /**
   * Actor identifier for surfaces the interceptor cannot read from the request
   * — the mobile assistant authenticates a clinician via Supabase rather than
   * an API key or operator token. Hashed before storage, like every other
   * identifier; never pass an email or any patient identifier here.
   */
  actorId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Correlation id for this request, minted by the audit interceptor. */
    vedamdRequestId?: string;
    /** Clinical summary for the audit trail, set by the controller. */
    vedamdAudit?: ClinicalAuditStash;
  }
}

/**
 * Minimal shape a controller needs to stash its audit summary. Controllers
 * type `@Req()` narrowly, so this avoids forcing every one of them onto the
 * full FastifyRequest type just to record an audit row.
 */
export interface AuditableRequest {
  vedamdAudit?: ClinicalAuditStash;
}

/** Hand the interceptor what this clinical request decided. */
export function stashClinicalAudit(req: AuditableRequest, stash: ClinicalAuditStash): void {
  req.vedamdAudit = stash;
}
