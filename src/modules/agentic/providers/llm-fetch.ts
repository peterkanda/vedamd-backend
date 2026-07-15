/**
 * fetch() wrapper for outbound LLM provider calls with a hard timeout.
 *
 * Without a timeout a single hung upstream stalls the whole request (and,
 * because the provider router falls back serially, the entire fallback
 * chain behind it). AbortSignal.timeout aborts the socket after
 * LLM_TIMEOUT_MS (default 30s) and we translate the AbortError into a clear,
 * body-free message so the caller can fall back to the next provider.
 */
export function llmTimeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
}

export async function fetchLlm(
  url: string,
  init: RequestInit,
  providerName: string,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(llmTimeoutMs()) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`${providerName} request timed out after ${llmTimeoutMs()} ms.`);
    }
    throw err;
  }
}
