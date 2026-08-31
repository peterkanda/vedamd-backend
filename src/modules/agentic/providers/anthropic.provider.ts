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
 * Anthropic Claude provider — primary agentic reasoner.
 *
 * Uses the native fetch API (Node ≥ 18) against the Anthropic Messages
 * API. No SDK dependency. The model is configurable via
 * AGENTIC_ANTHROPIC_MODEL (default: claude-sonnet-5, a strong
 * clinical reasoner with fast latency).
 *
 * PHI posture: the request body is sent to Anthropic for evaluation
 * only — it is NOT logged here, and the inbound clinical context is
 * never persisted by VedaMD. Integrators deploying with PHI must use
 * an Anthropic enterprise / zero-retention agreement (documented in
 * the integration guide).
 */
@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly endpoint = 'https://api.anthropic.com/v1/messages';

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.anthropicApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Anthropic provider not configured (ANTHROPIC_API_KEY missing).');
    }

    const body = {
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.1,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const status = res.status;
      // Do NOT log the response body — it may echo request context.
      this.log.warn('agentic_llm_error', { llm_provider: 'anthropic', status_code: status });
      throw new Error(`Anthropic API error: HTTP ${status}`);
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text =
      json.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('') ?? '';

    return {
      text,
      model: json.model ?? this.model,
      provider: 'anthropic',
      usage: {
        inputTokens: json.usage?.input_tokens,
        outputTokens: json.usage?.output_tokens,
      },
    };
  }
}
