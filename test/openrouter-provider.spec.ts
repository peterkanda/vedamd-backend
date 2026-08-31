import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenRouterProvider } from '../src/modules/agentic/providers/openrouter.provider';
import { ProviderRouter } from '../src/modules/agentic/providers/provider-router';
import type { LlmProvider } from '../src/modules/agentic/providers/llm-provider.interface';

/**
 * OpenRouter is the default agentic provider (MedGemma), with automatic
 * fallback to the other providers when it is not configured or errors.
 */

const noopLog = { warn: () => undefined, info: () => undefined, error: () => undefined } as never;

function provider(apiKey: string): OpenRouterProvider {
  const config = { get: () => apiKey } as unknown as ConfigService<never, true>;
  return new OpenRouterProvider(config, noopLog);
}

describe('OpenRouterProvider', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  it('is configured only when an API key is present', () => {
    expect(provider('').isConfigured()).toBe(false);
    expect(provider('sk-or-123').isConfigured()).toBe(true);
  });

  it('defaults to the MedGemma model and OpenRouter base URL', async () => {
    delete process.env.AGENTIC_OPENROUTER_MODEL;
    delete process.env.AGENTIC_OPENROUTER_BASE_URL;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        model: 'google/medgemma-27b-text-it',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as never);

    const res = await provider('sk-or-123').complete({ system: 's', user: 'u' });

    expect(res.provider).toBe('openrouter');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('google/medgemma-27b-text-it');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-123');
  });

  it('throws on a non-OK response so the router can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })) as never);
    await expect(provider('sk-or-123').complete({ system: 's', user: 'u' })).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe('ProviderRouter default routing', () => {
  const make = (name: string, configured: boolean): LlmProvider =>
    ({ name, isConfigured: () => configured, complete: vi.fn() }) as unknown as LlmProvider;
  const origEnv = { ...process.env };
  afterEach(() => (process.env = { ...origEnv }));

  it('leads with OpenRouter when configured, keeping others as fallback', () => {
    delete process.env.AGENTIC_PROVIDER;
    const openrouter = make('openrouter', true);
    const router = new ProviderRouter(
      make('anthropic', true) as never,
      make('openai', true) as never,
      make('deepseek', false) as never,
      make('gemini', false) as never,
      openrouter as never,
    );
    expect(router.advertisedProvider()).toBe('openrouter');
    expect(router.list().map((p) => p.name)).toContain('openrouter');
  });

  it('falls back to the next configured provider when OpenRouter is absent', () => {
    delete process.env.AGENTIC_PROVIDER;
    const router = new ProviderRouter(
      make('anthropic', true) as never,
      make('openai', true) as never,
      make('deepseek', false) as never,
      make('gemini', false) as never,
      make('openrouter', false) as never,
    );
    expect(router.advertisedProvider()).toBe('openai');
  });
});
