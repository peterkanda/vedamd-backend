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
 * fail, so we say which id is dead at startup rather than letting a
 * clinician's question surface it as a generic provider error. Add ids here
 * as they retire; see ai.google.dev/gemini-api/docs/deprecations.
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
 * against `maxOutputTokens`, so a long reasoning burst can leave too little
 * budget for the answer. The two families spell the control differently:
 *   - 2.5  → `thinkingBudget`, a token count (0 disables thinking)
 *   - 3.x  → `thinkingLevel`, a name ("low" | "high"); sending both a level
 *            and a budget is an error
 *   - 2.0 and older → no `thinkingConfig` at all
 *
 * Overrides: `AGENTIC_GEMINI_THINKING` (a token count, a level name, or
 * `default` to send nothing), then `AGENTIC_GEMINI_THINKING_BUDGET` (a
 * token count).
 */
export type ThinkingConfig = { thinkingBudget: number } | { thinkingLevel: string };

export function resolveThinkingConfig(model: string): ThinkingConfig | null {
  const isGemini3 = /gemini-(?:[3-9]|\d{2,})/i.test(model);
  const isGemini25 = /gemini-2\.5/i.test(model);
  const raw = (process.env.AGENTIC_GEMINI_THINKING ?? '').trim();
  const budget = (process.env.AGENTIC_GEMINI_THINKING_BUDGET ?? '').trim();

  if (raw.toLowerCase() === 'default') return null;
  if (raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return { thinkingBudget: Math.floor(n) };
    return { thinkingLevel: raw.toLowerCase() };
  }
  if (budget !== '') {
    const n = Number(budget);
    if (Number.isFinite(n) && n >= 0) return { thinkingBudget: Math.floor(n) };
  }
  // "low" rather than "minimal": minimal is not offered across the whole
  // 3.x line, and low is the least reasoning every one of them accepts.
  if (isGemini3) return { thinkingLevel: 'low' };
  if (isGemini25) return { thinkingBudget: 0 };
  return null;
}

/**
 * Output tokens to reserve for thinking on top of the answer's own budget.
 * A budget is not a hard cap — gemini-3.5-flash spent 1165 thinking tokens
 * against a 1024 budget when tested — so reserve twice the budget, and for a
 * named level (no token figure) what a 1024 budget would get.
 */
function thinkingHeadroom(thinking: ThinkingConfig | null): number {
  if (!thinking) return 0;
  if ('thinkingBudget' in thinking) return 2 * thinking.thinkingBudget;
  return 2 * 1024;
}

/**
 * Gemini provider — covers Google's public Gemini models (gemini-3.5-
 * flash, gemini-3.1-pro-preview, …) and, via the OpenAI-compatible
 * base-URL override, MedGemma when self-hosted (vLLM / Ollama / Vertex
 * AI Model Garden endpoint that speaks the OpenAI chat-completions
 * schema). MedGemma is not served by Google AI Studio directly; the
 * default base URL therefore targets the public generativelanguage
 * REST API.
 *
 * Configure with:
 *   GEMINI_API_KEY                  — Google AI Studio API key
 *   AGENTIC_GEMINI_MODEL            — default: gemini-3.5-flash
 *                                     (use "medgemma-27b-text-it" etc.
 *                                      when pointing at a self-hosted
 *                                      Vertex / vLLM endpoint)
 *   AGENTIC_GEMINI_THINKING         — thinking override: a token
 *                                     count, a level ("low"/"high") or
 *                                     "default" (native API only; see
 *                                     resolveThinkingConfig)
 *   AGENTIC_GEMINI_THINKING_BUDGET  — thinking override as a token
 *                                     count (used when the above is
 *                                     unset)
 *   AGENTIC_GEMINI_BASE_URL         — override for Vertex / self-host;
 *                                     when overridden the provider
 *                                     switches to the OpenAI-compatible
 *                                     /chat/completions wire format.
 *
 * PHI posture: same as the other cloud providers — body sent to the
 * configured endpoint and never logged here. Use Vertex AI with VPC
 * Service Controls or a self-hosted MedGemma deployment if PHI is in
 * scope. Google may use prompts sent on the Gemini API's unpaid tier to
 * improve its products, so a key used with patient data must be on a
 * billed project.
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
    this.thinking = resolveThinkingConfig(this.model);
    const override = process.env.AGENTIC_GEMINI_BASE_URL;
    this.baseUrl = override ?? 'https://generativelanguage.googleapis.com/v1beta';
    // When the operator points us at a custom endpoint (Vertex AI Model
    // Garden, self-hosted MedGemma via vLLM), assume the OpenAI-
    // compatible wire format — that's what Vertex's OpenAI endpoint and
    // vLLM expose.
    this.useOpenAiCompatible = Boolean(override);
    // Warn only when a key is set: an unconfigured provider is never
    // called, and warning then would be noise in every other deployment.
    if (this.apiKey && retiredOn(this.model)) {
      this.log.warn('agentic_llm_model_retired', { llm_provider: 'gemini', llm_model: this.model });
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
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.1,
        // Thinking tokens are drawn from maxOutputTokens. With the caller's
        // answer budget as the whole cap, gemini-2.5-flash and
        // gemini-3.8-flash each spent about half of 2048 on thinking and
        // stopped mid-answer — one inside an ORS volume table. So thinking
        // is capped per model family and gets room on top of the answer's
        // budget (see thinkingHeadroom).
        maxOutputTokens: (req.maxTokens ?? 2048) + thinkingHeadroom(this.thinking),
        ...(this.thinking ? { thinkingConfig: this.thinking } : {}),
        // Ask for a bare JSON object when the caller's contract is JSON,
        // rather than prose that happens to contain one.
        ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await fetchLlm(
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        // Header rather than ?key= so the key never sits in a URL that a
        // proxy or tracer might record.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
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
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
      modelVersion?: string;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const finishReason = candidate?.finishReason ?? json.promptFeedback?.blockReason ?? 'NONE';
    // Anything but STOP (MAX_TOKENS, SAFETY, a blocked prompt, …) means the
    // text is partial or absent. A partial clinical answer can end mid-dose,
    // so throw — the router then tries the next approved model or declines.
    if (finishReason !== 'STOP' || !text) {
      throw incompleteAnswer(
        this.log,
        'gemini',
        'Gemini',
        this.model,
        finishReason === 'STOP' ? 'empty' : finishReason,
      );
    }

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
      });
      throw new Error(`Gemini (OpenAI-compat) API error: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';
    // "length" is this schema's MAX_TOKENS; see completeNative.
    const compatReason = choice?.finish_reason ?? 'none';
    if (OPENAI_COMPAT_INCOMPLETE.has(compatReason) || !text) {
      throw incompleteAnswer(
        this.log,
        'gemini',
        'Gemini',
        this.model,
        OPENAI_COMPAT_INCOMPLETE.has(compatReason) ? compatReason : 'empty',
      );
    }

    return {
      text,
      model: json.model ?? this.model,
      provider: 'gemini',
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      },
    };
  }
}
