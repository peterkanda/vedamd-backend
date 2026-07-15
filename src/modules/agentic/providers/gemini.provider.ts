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
 * Gemini provider — covers Google's public Gemini models (gemini-2.0-
 * flash, gemini-1.5-pro) and, via the OpenAI-compatible base-URL
 * override, MedGemma when self-hosted (vLLM / Ollama / Vertex AI
 * Model Garden endpoint that speaks the OpenAI chat-completions
 * schema). MedGemma is not served by Google AI Studio directly; the
 * default base URL therefore targets the public generativelanguage
 * REST API.
 *
 * Configure with:
 *   GEMINI_API_KEY                — Google AI Studio API key
 *   AGENTIC_GEMINI_MODEL          — default: gemini-2.0-flash
 *                                   (use "medgemma-27b-text-it" etc.
 *                                    when pointing at a self-hosted
 *                                    Vertex / vLLM endpoint)
 *   AGENTIC_GEMINI_BASE_URL       — override for Vertex / self-host;
 *                                   when overridden the provider
 *                                   switches to the OpenAI-compatible
 *                                   /chat/completions wire format.
 *
 * PHI posture: same as the other cloud providers — body sent to the
 * configured endpoint and never logged here. Use Vertex AI with VPC
 * Service Controls or a self-hosted MedGemma deployment if PHI is in
 * scope.
 */
@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly useOpenAiCompatible: boolean;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.geminiApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_GEMINI_MODEL ?? 'gemini-2.0-flash';
    const override = process.env.AGENTIC_GEMINI_BASE_URL;
    this.baseUrl = override ?? 'https://generativelanguage.googleapis.com/v1beta';
    // When the operator points us at a custom endpoint (Vertex AI Model
    // Garden, self-hosted MedGemma via vLLM), assume the OpenAI-
    // compatible wire format — that's what Vertex's OpenAI endpoint and
    // vLLM expose.
    this.useOpenAiCompatible = Boolean(override);
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error('Gemini provider not configured (GEMINI_API_KEY missing).');
    }
    return this.useOpenAiCompatible
      ? this.completeOpenAiCompat(req)
      : this.completeNative(req);
  }

  /** Native generativelanguage REST schema (Google AI Studio). */
  private async completeNative(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const body = {
      // The native schema fuses system + user into the first user turn
      // (Gemini supports systemInstruction for newer models — included
      // for forward compatibility with 1.5+/2.0).
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.1,
        maxOutputTokens: req.maxTokens ?? 2048,
      },
    };
    const url =
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetchLlm(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      'gemini',
    );

    if (!res.ok) {
      this.log.warn('agentic_llm_error', {
        llm_provider: 'gemini',
        status_code: res.status,
      });
      throw new Error(`Gemini API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      modelVersion?: string;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    return {
      text,
      model: json.modelVersion ?? this.model,
      provider: 'gemini',
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  /** OpenAI-compatible /chat/completions schema (Vertex / vLLM / Ollama). */
  private async completeOpenAiCompat(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
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
      'gemini',
    );

    if (!res.ok) {
      this.log.warn('agentic_llm_error', {
        llm_provider: 'gemini',
        status_code: res.status,
        compat: 'openai',
      });
      throw new Error(`Gemini (OpenAI-compat) API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? this.model,
      provider: 'gemini',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
