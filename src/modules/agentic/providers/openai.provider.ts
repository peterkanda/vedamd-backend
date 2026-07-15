import { fetchLlm } from './llm-fetch';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../../common/phi-free-logger';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface';

/**
 * OpenAI provider — configurable fallback for the agentic engine.
 *
 * Uses the native fetch API against the Chat Completions endpoint.
 * Works with OpenAI directly OR any OpenAI-compatible endpoint
 * (Azure OpenAI, local vLLM / Ollama OpenAI shim) via
 * AGENTIC_OPENAI_BASE_URL. Model via AGENTIC_OPENAI_MODEL.
 */
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.openaiApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_OPENAI_MODEL ?? 'gpt-4o';
    this.baseUrl = process.env.AGENTIC_OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI provider not configured (OPENAI_API_KEY missing).');
    }

    const body = {
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.1,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    };

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
      this.log.warn('agentic_llm_error', {
        llm_provider: 'openai',
        status_code: status,
        attempt,
        retryable,
        quota_exhausted: isQuota,
      });
      if (!retryable || attempt === MAX_ATTEMPTS) {
        const reason = isQuota ? ' (insufficient_quota)' : '';
        throw new Error(`OpenAI API error: HTTP ${status}${reason}`);
      }
      // Respect Retry-After when present, else exponential backoff.
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    if (!res || !res.ok) {
      throw new Error('OpenAI API error: exhausted retries');
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = json.choices?.[0]?.message?.content ?? '';

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
