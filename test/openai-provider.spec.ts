import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenAiProvider } from '../src/modules/agentic/providers/openai.provider';
import { PhiFreeLogger } from '../src/common/phi-free-logger';

/**
 * OpenAI is the default provider for the backend's clinical chat and agentic
 * API. Its current models reason before answering, and that reasoning counts
 * against the completion budget, so a response can stop short — the provider
 * must never hand back a partial answer as if it were complete.
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

function provider(apiKey = 'sk-test'): OpenAiProvider {
  const config = { get: () => apiKey } as unknown as ConfigService<never, true>;
  return new OpenAiProvider(config, strictLog);
}

const completion = (content: string | null, finish_reason = 'stop') => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content }, finish_reason }],
    model: 'gpt-6-astra',
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
});

function stub(...responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fetchMock as never);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);

describe('OpenAiProvider', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is configured only when an API key is present', () => {
    expect(provider('').isConfigured()).toBe(false);
    expect(provider().isConfigured()).toBe(true);
  });

  it('sends reasoning-model parameters to the OpenAI API', async () => {
    delete process.env.AGENTIC_OPENAI_BASE_URL;
    delete process.env.AGENTIC_OPENAI_REASONING_HEADROOM;
    process.env.AGENTIC_OPENAI_MODEL = 'gpt-6-astra';
    process.env.AGENTIC_OPENAI_REASONING_EFFORT = 'low';
    const fetchMock = stub(completion('ORS 75 mL/kg over 4 hours.'));

    const res = await provider().complete({ system: 's', user: 'u', maxTokens: 1500 });

    expect(res).toMatchObject({ text: 'ORS 75 mL/kg over 4 hours.', provider: 'openai' });
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({
      model: 'gpt-6-astra',
      max_completion_tokens: 1500 + 24_000,
      reasoning_effort: 'low',
    });
    // Reasoning models reject both of these.
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('leaves reasoning_effort to the model default when unset', async () => {
    delete process.env.AGENTIC_OPENAI_BASE_URL;
    delete process.env.AGENTIC_OPENAI_REASONING_EFFORT;
    const fetchMock = stub(completion('ok'));
    await provider().complete({ system: 's', user: 'u' });
    expect(sentBody(fetchMock)).not.toHaveProperty('reasoning_effort');
  });

  it('keeps classic parameters for an OpenAI-compatible endpoint', async () => {
    process.env.AGENTIC_OPENAI_BASE_URL = 'http://localhost:8000/v1';
    const fetchMock = stub(completion('ok'));

    await provider().complete({ system: 's', user: 'u', maxTokens: 1500, temperature: 0.2 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:8000/v1/chat/completions');
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({ max_tokens: 1500, temperature: 0.2 });
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it.each(['length', 'content_filter'])(
    'throws rather than return a partial answer when finish_reason is %s',
    async (reason) => {
      stub(completion('Plan B: give ORS 75 mL/kg. For 4–11 months: 400', reason));
      await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
        new RegExp(`incomplete answer.*${reason}`),
      );
    },
  );

  it('throws on an empty answer (all budget spent reasoning)', async () => {
    stub(completion(null, 'stop'));
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer/,
    );
  });

  it('retries a transient 5xx and then succeeds', async () => {
    vi.useFakeTimers();
    const fail = { ok: false, status: 503, text: async () => '', headers: new Headers() };
    const fetchMock = stub(fail, completion('ok'));

    const pending = provider().complete({ system: 's', user: 'u' });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ text: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an exhausted quota', async () => {
    const quota = {
      ok: false,
      status: 429,
      text: async () => '{"error":{"code":"insufficient_quota"}}',
      headers: new Headers(),
    };
    const fetchMock = stub(quota);
    await expect(provider().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /HTTP 429 \(insufficient_quota\)/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
