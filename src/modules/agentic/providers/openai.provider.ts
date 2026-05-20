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
  private readonly model: string;
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const status = res.status;
      this.log.warn('agentic_llm_error', { llm_provider: 'openai', status_code: status });
      throw new Error(`OpenAI API error: HTTP ${status}`);
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
