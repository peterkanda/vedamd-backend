import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface';

/**
 * Provider router — picks the LLM provider per request so a key
 * rotation or transient outage degrades gracefully.
 *
 * AGENTIC_PROVIDER env explicitly overrides ordering:
 *   "openai"              → OpenAI first, Claude fallback
 *   "anthropic"           → Claude first, OpenAI fallback
 *   "openai-only"         → OpenAI only (no fallback)
 *   "anthropic-only"      → Claude only (no fallback)
 *
 * If AGENTIC_PROVIDER is unset, the router auto-selects based on
 * which keys are present: prefers OpenAI (broader model availability
 * for most integrators) if its key is set, otherwise Claude. This
 * makes a fresh deployment with only OPENAI_API_KEY work without
 * additional configuration.
 */
@Injectable()
export class ProviderRouter {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
  ) {}

  /** Returns the ordered list of providers to attempt. */
  private order(): LlmProvider[] {
    const pref = process.env.AGENTIC_PROVIDER?.toLowerCase();
    switch (pref) {
      case 'openai':
        return [this.openai, this.anthropic];
      case 'anthropic':
        return [this.anthropic, this.openai];
      case 'anthropic-only':
        return [this.anthropic];
      case 'openai-only':
        return [this.openai];
      default:
        // Auto: prefer OpenAI if configured (broader integrator
        // availability), otherwise fall back to Claude. Both are
        // always tried in the order [primary, fallback] when both
        // are configured.
        return this.openai.isConfigured()
          ? [this.openai, this.anthropic]
          : [this.anthropic, this.openai];
    }
  }

  /** True if at least one provider is configured. */
  anyConfigured(): boolean {
    return this.anthropic.isConfigured() || this.openai.isConfigured();
  }

  /**
   * Human-readable name of the provider that will be tried first for
   * the next request — surfaced on the /capabilities endpoint so the
   * UI can show the right provenance.
   */
  advertisedProvider(): string {
    const first = this.order().find((p) => p.isConfigured());
    return first?.name ?? 'none';
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
