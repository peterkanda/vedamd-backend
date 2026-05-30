import { Injectable, Logger } from '@nestjs/common';
import type { LlmProviderName } from './providers/llm-provider.interface';

const VALID_PROVIDERS: LlmProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini'];

export interface LlmPreference {
  /** Integrator-chosen provider, or null to defer to the operator default. */
  provider: LlmProviderName | null;
  /** Optional model override — providers default sensibly when unset. */
  model: string | null;
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
        model: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  set(
    integratorId: string,
    dto: { provider?: string | null; model?: string | null },
  ): LlmPreference {
    const provider =
      dto.provider == null || dto.provider === '' ? null : (dto.provider as string);
    if (provider !== null && !VALID_PROVIDERS.includes(provider as LlmProviderName)) {
      throw new Error(
        `Invalid provider "${provider}". Valid: ${VALID_PROVIDERS.join(', ')}.`,
      );
    }
    const next: LlmPreference = {
      provider: provider as LlmProviderName | null,
      model: dto.model?.trim() || null,
      updatedAt: new Date().toISOString(),
    };
    this.mem.set(integratorId, next);
    return next;
  }
}

export { VALID_PROVIDERS };
