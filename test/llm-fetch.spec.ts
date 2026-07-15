import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLlm, llmTimeoutMs } from '../src/modules/agentic/providers/llm-fetch';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LLM_TIMEOUT_MS;
});

describe('llm-fetch timeout (G6)', () => {
  it('defaults to 30s and honours LLM_TIMEOUT_MS', () => {
    expect(llmTimeoutMs()).toBe(30_000);
    process.env.LLM_TIMEOUT_MS = '5000';
    expect(llmTimeoutMs()).toBe(5_000);
  });

  it('passes an AbortSignal to fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await fetchLlm('https://example.com', { method: 'POST' }, 'anthropic');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('translates an abort/timeout into a clear provider error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );
    await expect(fetchLlm('https://example.com', {}, 'openai')).rejects.toThrow(
      /openai request timed out/,
    );
  });
});
