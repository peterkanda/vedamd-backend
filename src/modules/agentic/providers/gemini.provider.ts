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
 * Default when the operator names no model.
 *
 * NOT a model chosen for quality — it is simply one that still exists.
 * Google retires Gemini model ids on a published schedule and a retired id
 * returns an error, so a stale default silently breaks every deployment
 * that never set AGENTIC_GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/**
 * Model ids Google has already shut down, with the date. Calls to these
 * fail, so we say which id is dead and when it died at startup rather than
 * letting a clinician's question surface it as a generic provider error.
 * Add ids here as they retire; see ai.google.dev/gemini-api/docs/deprecations.
 */
export const RETIRED_GEMINI_MODELS: Record<string, string> = {
  'gemini-2.0-flash': '2026-06-01',
  'gemini-2.0-flash-001': '2026-06-01',
  'gemini-2.0-flash-lite': '2026-06-01',
  'gemini-2.0-flash-lite-001': '2026-06-01',
  'gemini-1.5-pro': '2025-09-24',
  'gemini-1.5-flash': '2025-09-24',
};

export function retiredOn(model: string): string | undefined {
  return RETIRED_GEMINI_MODELS[model.trim().toLowerCase()];
}

/**
 * How much of the output budget Gemini may spend on internal reasoning.
 *
 * Thinking is ON by default from 2.5 onward and its tokens are billed
 * against `maxOutputTokens`, so a long reasoning burst leaves too little
 * budget for the answer and the reply is cut off mid-sentence. The cards
 * this provider serves are a summary of records the retriever already
 * selected, so the budget belongs to the answer.
 *
 * The two families spell it differently and REJECT each other's field:
 *   - 2.5  → `thinkingBudget`, a token count (0 disables thinking)
 *   - 3.x  → `thinkingLevel`, a name ("low" | "high"); passing a budget
 *            as well is an error
 *   - 2.0 and older → no `thinkingConfig` at all
 *
 * `AGENTIC_GEMINI_THINKING` overrides: a token count, a level name, or
 * `default` to send nothing and let Google decide.
 */
export type ThinkingConfig = { thinkingBudget: number } | { thinkingLevel: string };

export function resolveThinkingConfig(model: string): ThinkingConfig | null {
  const isGemini3 = /gemini-(?:[3-9]|\d{2,})/i.test(model);
  const isGemini25 = /gemini-2\.5/i.test(model);
  const raw = (process.env.AGENTIC_GEMINI_THINKING ?? '').trim();

  if (raw.toLowerCase() === 'default') return null;
  if (raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return { thinkingBudget: Math.floor(n) };
    return { thinkingLevel: raw.toLowerCase() };
  }
  // "low" rather than "minimal": minimal is not offered across the whole
  // 3.x line, and low is the least reasoning every one of them accepts.
  if (isGemini3) return { thinkingLevel: 'low' };
  if (isGemini25) return { thinkingBudget: 0 };
  return null;
}

/**
 * Gemini provider — covers Google's public Gemini models and, via the
 * OpenAI-compatible base-URL
 * override, MedGemma when self-hosted (vLLM / Ollama / Vertex AI
 * Model Garden endpoint that speaks the OpenAI chat-completions
 * schema). MedGemma is not served by Google AI Studio directly; the
 * default base URL therefore targets the public generativelanguage
 * REST API.
 *
 * Configure with:
 *   GEMINI_API_KEY                — Google AI Studio API key
 *   AGENTIC_GEMINI_MODEL          — default: gemini-3.5-flash
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
  private readonly thinking: ThinkingConfig | null;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {
    this.apiKey = this.config.get('llm.geminiApiKey', { infer: true }) ?? '';
    this.model = process.env.AGENTIC_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    const override = process.env.AGENTIC_GEMINI_BASE_URL;
    this.baseUrl = override ?? 'https://generativelanguage.googleapis.com/v1beta';
    // When the operator points us at a custom endpoint (Vertex AI Model
    // Garden, self-hosted MedGemma via vLLM), assume the OpenAI-
    // compatible wire format — that's what Vertex's OpenAI endpoint and
    // vLLM expose.
    this.useOpenAiCompatible = Boolean(override);
    this.thinking = resolveThinkingConfig(this.model);
    const dead = retiredOn(this.model);
    if (dead) {
      // Only when a key is actually set — an unconfigured provider is never
      // called, and warning then would be noise in every other deployment.
      if (this.apiKey) {
        this.log.warn('agentic_llm_model_retired', {
          llm_provider: 'gemini',
          llm_model: this.model,
          retired_on: dead,
        });
      }
    }
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
        ...(this.thinking ? { thinkingConfig: this.thinking } : {}),
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
