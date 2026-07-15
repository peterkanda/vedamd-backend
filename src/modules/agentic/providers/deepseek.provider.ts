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
 * DeepSeek provider — adds a third agentic backend option alongside
 * OpenAI and Anthropic. DeepSeek exposes an OpenAI-compatible
 * /chat/completions endpoint, so the wire-format is identical.
 *
 * Configure with DEEPSEEK_API_KEY. Override the model via
 * AGENTIC_DEEPSEEK_MODEL (default: deepseek-chat — the general V3
 * model; deepseek-reasoner is the R1-style reasoning model).
 *
 * PHI posture: same as the other cloud providers — the request body
 * goes to DeepSeek for evaluation only and is never logged here.
 * Operators handling PHI need a contractual zero-retention arrangement
 * before routing real patient context through DeepSeek.
 */
@Injectable()
export class DeepseekProvider implements LlmProvider {
  readonly name = 'deepseek' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.deepseekApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_DEEPSEEK_MODEL ?? 'deepseek-chat';
    this.baseUrl = process.env.AGENTIC_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('DeepSeek provider not configured (DEEPSEEK_API_KEY missing).');
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

    const res = await fetchLlm(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      'deepseek',
    );

    if (!res.ok) {
      this.log.warn('agentic_llm_error', {
        llm_provider: 'deepseek',
        status_code: res.status,
      });
      throw new Error(`DeepSeek API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? this.model,
      provider: 'deepseek',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
