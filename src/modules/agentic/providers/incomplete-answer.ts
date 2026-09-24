import type { PhiFreeLogger } from '../../../common/phi-free-logger';
import type { LlmProviderName } from './llm-provider.interface';

/**
 * The error a provider throws instead of returning a truncated, filtered or
 * empty completion. A partial clinical answer can end mid-dose, so it must
 * never reach a caller looking like a complete one; throwing lets the router
 * try the next approved model or decline.
 *
 * `finishReason` is the API's own enum (length, max_tokens, SAFETY, …) and
 * never content, so it is safe to log.
 */
export function incompleteAnswer(
  log: PhiFreeLogger,
  provider: LlmProviderName,
  displayName: string,
  model: string,
  finishReason: string,
): Error {
  log.warn('agentic_llm_error', {
    llm_provider: provider,
    llm_model: model,
    error_category: `incomplete_${finishReason.toLowerCase()}`,
  });
  return new Error(
    `${displayName} returned an incomplete answer (finish reason: ${finishReason}).`,
  );
}

/**
 * Finish reasons that mean an OpenAI-compatible completion stopped short.
 * Anything else (stop, eos, a missing value from a minimal server) is taken as
 * a natural end, provided the text is non-empty.
 */
export const OPENAI_COMPAT_INCOMPLETE = new Set(['length', 'content_filter']);
