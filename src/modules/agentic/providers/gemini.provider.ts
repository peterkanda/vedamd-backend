import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../../common/phi-free-logger';
import type {
  LlmCompletionRequest,
  ProviderCompletion,
  LlmProvider,
} from './llm-provider.interface';

/**
 * Output-token budget Gemini may spend on internal reasoning.
 *
 * Only 2.5 and later accept `thinkingConfig`, so older models get no such
 * field (sending one is an API error). There, thinking is ON by default and
 * its tokens count against `maxOutputTokens` — so a long reasoning burst
 * leaves too little budget for the answer and the response is cut off
 * mid-sentence. For the structured clinical cards this provider serves,
 * the reasoning is already done: the model is summarising records the
 * retriever handed it, so the budget belongs to the answer.
 *
 * `AGENTIC_GEMINI_THINKING_BUDGET` overrides: a token count, or `default`
 * to send nothing and let Google decide.
 */
export function resolveThinkingBudget(model: string): number | null {
  const raw = process.env.AGENTIC_GEMINI_THINKING_BUDGET;
  if (raw && raw.trim().toLowerCase() === 'default') return null;
  if (raw && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  // Field exists from 2.5 onward; 1.x / 2.0 reject it.
  return /gemini-(?:2\.5|3|[4-9])/i.test(model) ? 0 : null;
}

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
  /** null = send no thinkingConfig at all (model predates the field). */
  private readonly thinkingBudget: number | null;

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
    this.thinkingBudget = resolveThinkingBudget(this.model);
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(req: LlmCompletionRequest): Promise<ProviderCompletion> {
    if (!this.isConfigured()) {
      throw new Error('Gemini provider not configured (GEMINI_API_KEY missing).');
    }
    return this.useOpenAiCompatible ? this.completeOpenAiCompat(req) : this.completeNative(req);
  }

  /** Native generativelanguage REST schema (Google AI Studio). */
  private async completeNative(req: LlmCompletionRequest): Promise<ProviderCompletion> {
    const body = {
      // The native schema fuses system + user into the first user turn
      // (Gemini supports systemInstruction for newer models — included
      // for forward compatibility with 1.5+/2.0).
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.1,
        maxOutputTokens: req.maxTokens ?? 2048,
        // Ask the model for a bare JSON object rather than prose that
        // happens to contain one. Removes the code fence the extractor
        // would otherwise have to strip, and with it a whole class of
        // "model wrapped the JSON in commentary" failures.
        ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
        // Thinking tokens are billed against maxOutputTokens on 2.5+ and
        // thinking is ON by default there. A reasoning burst then eats the
        // budget and the answer is cut off mid-JSON — which is exactly how
        // a half-written `{"cards":[…` reached the clinical UI. Clinical
        // synthesis here is short and grounded in retrieved records, so we
        // spend the budget on the answer.
        ...(this.thinkingBudget !== null
          ? { thinkingConfig: { thinkingBudget: this.thinkingBudget } }
          : {}),
      },
    };
    const url =
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      this.log.warn('agentic_llm_error', {
        llm_provider: 'gemini',
        status_code: res.status,
      });
      throw new Error(`Gemini API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      modelVersion?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    };

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const truncated = json.candidates?.[0]?.finishReason === 'MAX_TOKENS';

    if (truncated) {
      this.log.warn('agentic_llm_truncated', {
        llm_provider: 'gemini',
        llm_model: this.model,
        output_tokens: json.usageMetadata?.candidatesTokenCount,
        thinking_tokens: json.usageMetadata?.thoughtsTokenCount,
      });
    }

    return {
      text,
      model: json.modelVersion ?? this.model,
      provider: 'gemini',
      truncated,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  /** OpenAI-compatible /chat/completions schema (Vertex / vLLM / Ollama). */
  private async completeOpenAiCompat(req: LlmCompletionRequest): Promise<ProviderCompletion> {
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
      this.log.warn('agentic_llm_error', {
        llm_provider: 'gemini',
        status_code: res.status,
        compat: 'openai',
      });
      throw new Error(`Gemini (OpenAI-compat) API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      model: json.model ?? this.model,
      provider: 'gemini',
      truncated: json.choices?.[0]?.finish_reason === 'length',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
