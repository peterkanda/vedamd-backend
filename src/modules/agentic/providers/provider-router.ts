import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import { DeepseekProvider } from './deepseek.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenRouterProvider } from './openrouter.provider';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
  LlmProviderName,
} from './llm-provider.interface';

/**
 * Provider router — picks the LLM provider per request so a key
 * rotation or transient outage degrades gracefully.
 *
 * Three layers of selection (highest priority first):
 *  1. Per-request `preferredProvider` — set by callers that have a
 *     tenant-scoped preference (e.g. an integrator who chose "gemini"
 *     in their developer settings).
 *  2. `AGENTIC_PROVIDER` env var — operator-wide override, e.g.
 *     "openai", "anthropic", "deepseek", "gemini", "openai-only" etc.
 *  3. Auto-select — prefer OpenAI when configured, otherwise the first
 *     configured provider in [openai, anthropic, deepseek, gemini].
 *
 * Whichever provider is selected, the router falls back to the next
 * configured provider on failure (unless an "*-only" preference is
 * set).
 */
@Injectable()
export class ProviderRouter {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
    private readonly deepseek: DeepseekProvider,
    private readonly gemini: GeminiProvider,
    private readonly openrouter: OpenRouterProvider,
  ) {}

  private byName(name: LlmProviderName): LlmProvider {
    switch (name) {
      case 'openrouter':
        return this.openrouter;
      case 'openai':
        return this.openai;
      case 'anthropic':
        return this.anthropic;
      case 'deepseek':
        return this.deepseek;
      case 'gemini':
        return this.gemini;
    }
  }

  /** All providers, in default fallback order. OpenRouter (MedGemma) leads, so
   *  it is the default and every other provider is a fallback behind it. */
  private all(): LlmProvider[] {
    return [this.openrouter, this.openai, this.anthropic, this.deepseek, this.gemini];
  }

  /** Returns the ordered list of providers to attempt for this request. */
  private order(preferred?: LlmProviderName): LlmProvider[] {
    if (preferred) {
      const first = this.byName(preferred);
      const rest = this.all().filter((p) => p.name !== first.name);
      return [first, ...rest];
    }
    const pref = process.env.AGENTIC_PROVIDER?.toLowerCase();
    switch (pref) {
      case 'openrouter':
        return [this.openrouter, this.openai, this.anthropic, this.deepseek, this.gemini];
      case 'openai':
        return [this.openai, this.openrouter, this.anthropic, this.deepseek, this.gemini];
      case 'anthropic':
        return [this.anthropic, this.openrouter, this.openai, this.deepseek, this.gemini];
      case 'deepseek':
        return [this.deepseek, this.openrouter, this.openai, this.anthropic, this.gemini];
      case 'gemini':
        return [this.gemini, this.openrouter, this.openai, this.anthropic, this.deepseek];
      case 'openrouter-only':
        return [this.openrouter];
      case 'openai-only':
        return [this.openai];
      case 'anthropic-only':
        return [this.anthropic];
      case 'deepseek-only':
        return [this.deepseek];
      case 'gemini-only':
        return [this.gemini];
      default: {
        // Auto: prefer OpenRouter (MedGemma) when configured, otherwise the
        // first configured provider in the default fallback order.
        const ordered = this.all();
        const idx = ordered.findIndex((p) => p.isConfigured());
        if (idx <= 0) return ordered;
        return [ordered[idx], ...ordered.slice(0, idx), ...ordered.slice(idx + 1)];
      }
    }
  }

  /** True if at least one provider is configured. */
  anyConfigured(): boolean {
    return this.all().some((p) => p.isConfigured());
  }

  /** Provider expected to handle the next request — for /capabilities. */
  advertisedProvider(preferred?: LlmProviderName): string {
    const first = this.order(preferred).find((p) => p.isConfigured());
    return first?.name ?? 'none';
  }

  /** Model id the next request will use (e.g. the MedGemma id) — for /capabilities. */
  advertisedModel(preferred?: LlmProviderName): string | null {
    const first = this.order(preferred).find((p) => p.isConfigured());
    return first?.model ?? null;
  }

  /** Names + configured flags — for /capabilities and the developer UI. */
  list(): Array<{ name: LlmProviderName; configured: boolean }> {
    return this.all().map((p) => ({ name: p.name, configured: p.isConfigured() }));
  }

  /** Attempt completion across providers in order; throws if all fail.
   *  Pass `preferredProvider` to steer routing for this single call. */
  async complete(
    req: LlmCompletionRequest,
    opts: { preferredProvider?: LlmProviderName } = {},
  ): Promise<LlmCompletionResult> {
    const providers = this.order(opts.preferredProvider).filter((p) => p.isConfigured());
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
