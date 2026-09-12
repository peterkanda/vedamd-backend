import { Injectable, Logger } from '@nestjs/common';
import type { LlmProviderName } from './providers/llm-provider.interface';

/**
 * `openrouter` was missing here, which meant an integrator could not select
 * the provider that serves MedGemma — and because `order()` puts any chosen
 * provider first and keeps the rest as fallbacks, setting *any* preference
 * silently demoted the medical model to second place.
 */
const VALID_PROVIDERS: LlmProviderName[] = [
  'openrouter',
  'anthropic',
  'openai',
  'deepseek',
  'gemini',
];

export interface LlmPreference {
  /** Integrator-chosen provider, or null to defer to the operator default. */
  provider: LlmProviderName | null;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

/**
 * Per-integrator preferred LLM provider/model used by the reference
 * chat and agentic flows. In-memory only for now — survives the
 * process lifetime; a DB-backed table can be added later without
 * changing this surface.
 *
 * BYO-API-KEY for the chosen provider is NOT stored here yet. Each
 * deployment supplies its provider keys via env (ANTHROPIC_API_KEY,
 * OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY); the per-tenant
 * preference only steers which configured provider handles their
 * requests.
 */
@Injectable()
export class LlmPreferenceService {
  private readonly logger = new Logger(LlmPreferenceService.name);
  private readonly mem = new Map<string, LlmPreference>();

  get(integratorId: string): LlmPreference {
    return (
      this.mem.get(integratorId) ?? {
        provider: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  /**
   * There is deliberately no per-integrator model override. One used to be
   * accepted, stored and shown in the developer portal, but nothing ever read
   * it — the agentic engine passes only the provider. Model choice belongs
   * with the operator, who is the one who can say whether a given model is
   * fit for clinical reasoning; a free-text per-tenant override would let a
   * tenant point clinical answers at an arbitrary model.
   */
  set(integratorId: string, dto: { provider?: string | null }): LlmPreference {
    const provider = dto.provider == null || dto.provider === '' ? null : (dto.provider as string);
    if (provider !== null && !VALID_PROVIDERS.includes(provider as LlmProviderName)) {
      throw new Error(`Invalid provider "${provider}". Valid: ${VALID_PROVIDERS.join(', ')}.`);
    }
    const next: LlmPreference = {
      provider: provider as LlmProviderName | null,
      updatedAt: new Date().toISOString(),
    };
    this.mem.set(integratorId, next);
    return next;
  }
}

export { VALID_PROVIDERS };
