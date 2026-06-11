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
}

export interface LlmCompletionResult {
  /** Raw text output from the model. */
  text: string;
  /** Model identifier actually used. */
  model: string;
  /** Provider name. */
  provider: LlmProviderName;
  /** Token usage (best-effort; may be undefined). */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** All providers VedaMD's agentic engine can route to. */
export type LlmProviderName = 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'openrouter';

export interface LlmProvider {
  /** Provider identity. */
  readonly name: LlmProviderName;
  /** The model id this provider is configured to use (e.g. the MedGemma id). */
  readonly model: string;
  /** Whether the provider is configured (has API key). */
  isConfigured(): boolean;
  /** Run a single completion. Throws on provider error. */
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
