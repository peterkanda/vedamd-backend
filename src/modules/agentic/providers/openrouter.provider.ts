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
 * OpenRouter provider — the default agentic backend, configured to run
 * MedGemma (Google's medical Gemma) with automatic fallback to the other
 * providers when it is unavailable.
 *
 * OpenRouter exposes an OpenAI-compatible /chat/completions endpoint, so the
 * wire-format is identical to the OpenAI/DeepSeek providers — only the base
 * URL, key and model differ. Configure with:
 *   - OPENROUTER_API_KEY            (required)
 *   - AGENTIC_OPENROUTER_MODEL      (default: google/medgemma-27b-text-it)
 *   - AGENTIC_OPENROUTER_BASE_URL   (default: https://openrouter.ai/api/v1)
 *
 * IMPORTANT — MedGemma availability: MedGemma is a Google open model, not (at
 * time of writing) part of OpenRouter's hosted catalogue. Two supported setups:
 *   1. Self-host MedGemma behind an OpenAI-compatible endpoint (vLLM, HF
 *      Inference Endpoints, Vertex AI, Replicate, …) and set
 *      AGENTIC_OPENROUTER_BASE_URL to that endpoint + its key in
 *      OPENROUTER_API_KEY. Best fit for PHI / offline-first.
 *   2. Use a model OpenRouter actually serves (e.g. google/gemma-3-27b-it) by
 *      overriding AGENTIC_OPENROUTER_MODEL.
 * If the configured model cannot be served, complete() throws and the
 * ProviderRouter falls back to the next configured provider — so a missing
 * MedGemma degrades gracefully rather than failing the request.
 *
 * PHI posture: identical to the other cloud providers — the request body is
 * sent to the endpoint for evaluation only and is never logged here. OpenRouter
 * routes to third-party hosts; operators handling PHI should self-host MedGemma
 * (setup 1) or secure a contractual zero-retention arrangement first.
 */
@Injectable()
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly siteUrl: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.openrouterApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_OPENROUTER_MODEL ?? 'google/medgemma-27b-text-it';
    this.baseUrl = process.env.AGENTIC_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
    this.siteUrl = process.env.OPENROUTER_SITE_URL ?? 'https://vedamd.io';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenRouter provider not configured (OPENROUTER_API_KEY missing).');
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
        // Optional OpenRouter attribution headers (ignored by other endpoints).
        'HTTP-Referer': this.siteUrl,
        'X-Title': 'VedaMD',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      this.log.warn('agentic_llm_error', {
        llm_provider: 'openrouter',
        status_code: res.status,
      });
      throw new Error(`OpenRouter API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? this.model,
      provider: 'openrouter',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
