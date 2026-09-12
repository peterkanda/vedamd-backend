import { Injectable, Logger } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import { DeepseekProvider } from './deepseek.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { NoMedicalProviderError, isMedicalModel } from './llm-provider.interface';
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
  private readonly logger = new Logger(ProviderRouter.name);

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

  /** Providers whose configured model the operator declared clinical-grade. */
  medicalProviders(): LlmProvider[] {
    return this.all().filter((p) => p.isConfigured() && isMedicalModel(p.model));
  }

  /** Attempt completion across providers in order; throws if all fail.
   *  Pass `preferredProvider` to steer routing for this single call. */
  async complete(
    req: LlmCompletionRequest,
    opts: { preferredProvider?: LlmProviderName } = {},
  ): Promise<LlmCompletionResult> {
    let providers = this.order(opts.preferredProvider).filter((p) => p.isConfigured());

    if (req.requireMedical) {
      // Restrict to declared clinical models rather than ordering them first:
      // a general-purpose model must not be reachable by fallback here.
      providers = providers.filter((p) => isMedicalModel(p.model));
      if (providers.length === 0) {
        throw new NoMedicalProviderError(
          'No clinical-grade model is configured. Set MEDICAL_MODEL_IDS to the model ids the ' +
            'operator has approved for clinical reasoning, and configure a provider serving one.',
        );
      }
    }

    if (providers.length === 0) {
      throw new Error('No LLM provider configured for agentic evaluation.');
    }

    const intended = providers[0].name;
    let lastErr: unknown;
    for (const provider of providers) {
      try {
        const result = await provider.complete(req);
        return {
          ...result,
          medical: isMedicalModel(result.model),
          fellBackFrom: provider.name === intended ? null : intended,
        };
      } catch (err) {
        lastErr = err;
        // A silent catch here is how "MedGemma" became GPT-4o without anyone
        // being able to tell. Record the substitution before trying the next.
        this.logger.warn(
          `LLM provider "${provider.name}" (${provider.model}) failed; ` +
            `${provider.name === providers[providers.length - 1].name ? 'no providers left' : 'falling back'}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (req.requireMedical) {
      throw new NoMedicalProviderError(
        `Every clinical-grade provider failed. Last error: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`,
      );
    }
    throw lastErr instanceof Error ? lastErr : new Error('All LLM providers failed.');
  }
}
