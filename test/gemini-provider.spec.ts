import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from '../src/modules/agentic/providers/gemini.provider';
import { PhiFreeLogger } from '../src/common/phi-free-logger';

/**
 * Gemini's thinking tokens come out of maxOutputTokens, so a response can
 * stop mid-answer. The provider must never hand back a partial answer as if
 * it were complete.
 */

// Strict, so a log field outside the PHI-free allow-list fails the test
// instead of replacing the provider's own error. 'fatal' keeps it quiet;
// the allow-list is checked before the level filter.
const strictLog = new PhiFreeLogger({
  service: 'test',
  hashSecret: 's',
  strict: true,
  level: 'fatal',
});

function provider(apiKey = 'AIza-test'): GeminiProvider {
  const config = { get: () => apiKey } as unknown as ConfigService<never, true>;
  return new GeminiProvider(config, strictLog);
}

function stubResponse(json: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => json }));
  vi.stubGlobal('fetch', fetchMock as never);
  return fetchMock;
}

const complete = (text: string, finishReason = 'STOP') => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason }],
  modelVersion: 'gemini-3.5-flash',
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

describe('GeminiProvider (native API)', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is configured only when an API key is present', () => {
    expect(provider('').isConfigured()).toBe(false);
    expect(provider().isConfigured()).toBe(true);
  });

  it('sends the key in a header, not the URL, and returns a complete answer', async () => {
    delete process.env.AGENTIC_GEMINI_MODEL;
    delete process.env.AGENTIC_GEMINI_BASE_URL;
    const fetchMock = stubResponse(complete('ORS 75 mL/kg over 4 hours.'));

    const res = await provider().complete({ system: 's', user: 'u' });

    expect(res).toMatchObject({
      text: 'ORS 75 mL/kg over 4 hours.',
      provider: 'gemini',
      model: 'gemini-3.5-flash',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    );
    expect(url).not.toContain('AIza-test');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
  });

  it('caps thinking and reserves room for it on top of the answer budget', async () => {
    process.env.AGENTIC_GEMINI_THINKING_BUDGET = '512';
    const fetchMock = stubResponse(complete('ok'));

    await provider().complete({ system: 's', user: 'u', maxTokens: 1500 });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const cfg = JSON.parse(init.body as string).generationConfig;
    expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 512 });
    expect(cfg.maxOutputTokens).toBe(1500 + 2 * 512);
  });

  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION'])(
    'throws rather than return a partial answer when finishReason is %s',
    async (reason) => {
      stubResponse(complete('Plan B: give ORS 75 mL/kg. For 4–11 months: 400', reason));
      await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
        new RegExp(`incomplete answer.*${reason}`),
      );
    },
  );

  it('throws when the prompt is blocked and no candidate comes back', async () => {
    stubResponse({ promptFeedback: { blockReason: 'SAFETY' } });
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer.*SAFETY/,
    );
  });

  it('throws on an empty answer even when finishReason is STOP', async () => {
    stubResponse(complete(''));
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer/,
    );
  });

  it('throws on a non-OK response so the router can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })) as never);
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(/HTTP 503/);
  });
});

describe('GeminiProvider (OpenAI-compatible endpoint)', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws on finish_reason "length" rather than return a truncated answer', async () => {
    process.env.AGENTIC_GEMINI_BASE_URL = 'https://vertex.example/v1';
    stubResponse({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] });
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer.*length/,
    );
  });

  it('throws a plain API error on a non-OK response', async () => {
    process.env.AGENTIC_GEMINI_BASE_URL = 'https://vertex.example/v1';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as never);
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /OpenAI-compat\) API error: HTTP 500/,
    );
  });
});
