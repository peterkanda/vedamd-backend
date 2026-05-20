import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface';

/**
 * Provider router — picks Claude (Anthropic) first, falls back to
 * OpenAI when Anthropic is unconfigured or errors. The active
 * provider is chosen per request so a key rotation / outage degrades
 * gracefully.
 *
 * AGENTIC_PROVIDER env overrides ordering:
 *   "anthropic" (default) → Claude first, OpenAI fallback
 *   "openai"              → OpenAI first, Claude fallback
 *   "anthropic-only"      → Claude only (no fallback)
 *   "openai-only"         → OpenAI only
 */
@Injectable()
export class ProviderRouter {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
  ) {}

  /** Returns the ordered list of providers to attempt. */
  private order(): LlmProvider[] {
    const pref = (process.env.AGENTIC_PROVIDER ?? 'anthropic').toLowerCase();
    switch (pref) {
      case 'openai':
        return [this.openai, this.anthropic];
      case 'anthropic-only':
        return [this.anthropic];
      case 'openai-only':
        return [this.openai];
      case 'anthropic':
      default:
        return [this.anthropic, this.openai];
    }
  }

  /** True if at least one provider is configured. */
  anyConfigured(): boolean {
    return this.anthropic.isConfigured() || this.openai.isConfigured();
  }

  /** Attempt completion across providers in order; throws if all fail. */
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const providers = this.order().filter((p) => p.isConfigured());
    if (providers.length === 0) {
      throw new Error('No LLM provider configured for agentic evaluation.');
    }
    let lastErr: unknown;
    for (const provider of providers) {
      try {
        return await provider.complete(req);
      } catch (err) {
        lastErr = err;
        // Try next provider in the fallback chain.
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('All LLM providers failed.');
  }
}
