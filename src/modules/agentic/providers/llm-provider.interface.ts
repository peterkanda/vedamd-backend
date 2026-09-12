/**
 * LLM provider abstraction. The agentic engine is provider-agnostic;
 * Claude (Anthropic) is the primary provider, OpenAI is a configurable
 * fallback. Add new providers by implementing this interface + wiring
 * into the factory.
 */

export interface LlmCompletionRequest {
  /** System prompt — the clinical-reasoner instructions. */
  system: string;
  /** User content — assembled patient context + retrieved knowledge. */
  user: string;
  /** Max output tokens. */
  maxTokens?: number;
  /** Sampling temperature (low for clinical determinism). */
  temperature?: number;
  /**
   * Only a model the operator has declared fit for clinical reasoning may
   * answer. Set by the clinical call sites. Without it the router would fall
   * through to a general-purpose model on error — the documented behaviour
   * being that "a missing MedGemma degrades gracefully" — which in practice
   * meant a clinician could be answered by GPT-4o under a MedGemma badge.
   */
  requireMedical?: boolean;
}

export interface LlmCompletionResult {
  /** Raw text output from the model. */
  text: string;
  /** Model identifier actually used. */
  model: string;
  /** Provider name. */
  provider: LlmProviderName;
  /** Whether the model that answered is operator-declared as clinical-grade. */
  medical: boolean;
  /**
   * Provider originally attempted, when an earlier one failed and the router
   * fell back. Null on a first-choice success. Surfaced so a substitution is
   * never invisible to the caller or the audit trail.
   */
  fellBackFrom?: LlmProviderName | null;
  /** Token usage (best-effort; may be undefined). */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Raised instead of quietly substituting a general-purpose model. */
export class NoMedicalProviderError extends Error {
  readonly code = 'no_medical_provider';
  constructor(message: string) {
    super(message);
    this.name = 'NoMedicalProviderError';
  }
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** All providers VedaMD's agentic engine can route to. */
export type LlmProviderName = 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'openrouter';

/**
 * What a provider itself returns. Whether the answering model counts as
 * clinical-grade, and whether a fallback happened, are routing policy — the
 * router decides them, not the individual providers.
 */
export type ProviderCompletion = Omit<LlmCompletionResult, 'medical' | 'fellBackFrom'>;

export interface LlmProvider {
  /** Provider identity. */
  readonly name: LlmProviderName;
  /** The model id this provider is configured to use (e.g. the MedGemma id). */
  readonly model: string;
  /** Whether the provider is configured (has API key). */
  isConfigured(): boolean;
  /** Run a single completion. Throws on provider error. */
  complete(req: LlmCompletionRequest): Promise<ProviderCompletion>;
}

/**
 * Models the operator declares fit for clinical reasoning, from
 * `MEDICAL_MODEL_IDS` (comma-separated, exact ids).
 *
 * Deliberately an explicit operator declaration and an exact-id match, not a
 * pattern on the model name: whether a model may answer a clinical question is
 * a decision someone must own, and a substring rule would silently bless
 * anything with "med" in its id. A self-hosted MedGemma behind Gemini or an
 * OpenAI-compatible endpoint is declared by adding its id here.
 */
export function medicalModelIds(): Set<string> {
  const raw = process.env.MEDICAL_MODEL_IDS ?? 'google/medgemma-27b-text-it';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isMedicalModel(modelId: string): boolean {
  return medicalModelIds().has(modelId.trim().toLowerCase());
}
