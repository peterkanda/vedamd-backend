import { fetchLlm } from './llm-fetch';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../../common/phi-free-logger';
import type {
  LlmCompletionRequest,
  ProviderCompletion,
  LlmProvider,
} from './llm-provider.interface';
import { incompleteAnswer, OPENAI_COMPAT_INCOMPLETE } from './incomplete-answer';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI provider — the default provider for the backend's clinical chat
 * and agentic API.
 *
 * Uses the native fetch API against the Chat Completions endpoint.
 * Works with OpenAI directly OR any OpenAI-compatible endpoint
 * (Azure OpenAI, local vLLM / Ollama OpenAI shim) via
 * AGENTIC_OPENAI_BASE_URL. Configure with:
 *   AGENTIC_OPENAI_MODEL              — model id
 *   AGENTIC_OPENAI_REASONING_EFFORT   — optional (low | medium | high …);
 *                                       unset = the model's own default
 *   AGENTIC_OPENAI_REASONING_HEADROOM — tokens allowed for hidden reasoning
 *                                       on top of the answer (default 24000)
 */
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly reasoningEffort: string | undefined;
  private readonly reasoningHeadroom: number;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.openaiApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_OPENAI_MODEL ?? 'gpt-4o';
    this.baseUrl = process.env.AGENTIC_OPENAI_BASE_URL ?? OPENAI_BASE_URL;
    this.reasoningEffort = process.env.AGENTIC_OPENAI_REASONING_EFFORT || undefined;
    this.reasoningHeadroom = Number(process.env.AGENTIC_OPENAI_REASONING_HEADROOM ?? 24_000);
  }

  /**
   * Current OpenAI models (GPT-5.x, GPT-6) are reasoning models: they accept
   * only the default temperature, and their hidden reasoning tokens count
   * against max_completion_tokens — OpenAI advises reserving at least 25,000
   * tokens for reasoning plus output, or the answer can come back cut short or
   * empty. OpenAI-compatible endpoints (vLLM, Ollama) serving ordinary models
   * keep the classic max_tokens + temperature parameters.
   */
  private requestBody(req: LlmCompletionRequest): Record<string, unknown> {
    const messages = [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ];
    if (this.baseUrl !== OPENAI_BASE_URL) {
      return {
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.1,
        messages,
      };
    }
    return {
      model: this.model,
      max_completion_tokens: (req.maxTokens ?? 2048) + this.reasoningHeadroom,
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
      messages,
    };
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<ProviderCompletion> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI provider not configured (OPENAI_API_KEY missing).');
    }

    const body = this.requestBody(req);

    // Retry transient rate-limits (429) and 5xx with backoff. A 429 that is
    // actually "insufficient_quota" is permanent, so we stop and let the
    // provider-router fall back to the next configured provider immediately.
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      res = await fetchLlm(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        'openai',
      );
      if (res.ok) break;

      const status = res.status;
      const detail = await res.text().catch(() => '');
      const isQuota = /insufficient_quota|exceeded your current quota/i.test(detail);
      const retryable = (status === 429 && !isQuota) || (status >= 500 && status < 600);
      // Allow-listed fields only: an unlisted one makes the PHI-free logger
      // throw outside production, which skipped these retries entirely.
      this.log.warn('agentic_llm_error', {
        llm_provider: 'openai',
        status_code: status,
        error_category: isQuota ? 'quota_exhausted' : retryable ? 'retryable' : 'non_retryable',
      });
      if (!retryable || attempt === MAX_ATTEMPTS) {
        const reason = isQuota ? ' (insufficient_quota)' : '';
        throw new Error(`OpenAI API error: HTTP ${status}${reason}`);
      }
      // Respect Retry-After when present, else exponential backoff.
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    if (!res || !res.ok) {
      throw new Error('OpenAI API error: exhausted retries');
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';
    const finishReason = choice?.finish_reason ?? 'none';
    if (OPENAI_COMPAT_INCOMPLETE.has(finishReason) || !text) {
      throw incompleteAnswer(
        this.log,
        'openai',
        'OpenAI',
        this.model,
        OPENAI_COMPAT_INCOMPLETE.has(finishReason) ? finishReason : 'empty',
      );
    }

    return {
      text,
      model: json.model ?? this.model,
      provider: 'openai',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
