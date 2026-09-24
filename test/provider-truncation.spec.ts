import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AnthropicProvider } from '../src/modules/agentic/providers/anthropic.provider';
import { DeepseekProvider } from '../src/modules/agentic/providers/deepseek.provider';
import { OpenRouterProvider } from '../src/modules/agentic/providers/openrouter.provider';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { LlmProvider } from '../src/modules/agentic/providers/llm-provider.interface';

/**
 * OpenRouter serves MedGemma, the default approved clinical model, so a
 * truncated completion from it (or from Anthropic / DeepSeek) must throw —
 * the router then tries the next approved model or declines — rather than
 * reach a clinician as a finished answer that stops mid-dose.
 */

const strictLog = new PhiFreeLogger({
  service: 'test',
  hashSecret: 's',
  strict: true,
  level: 'fatal',
});
const config = { get: () => 'key-123' } as unknown as ConfigService<never, true>;

const respond = (json: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => json })) as never);

const openAiShape = (content: string | null, finish_reason: string) => ({
  choices: [{ message: { content }, finish_reason }],
  model: 'm',
});

const compatProviders: Array<[string, () => LlmProvider]> = [
  ['OpenRouter', () => new OpenRouterProvider(config, strictLog)],
  ['DeepSeek', () => new DeepseekProvider(config, strictLog)],
];

describe.each(compatProviders)('%s truncation guard', (_name, make) => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a finished answer', async () => {
    respond(openAiShape('Amoxicillin 40 mg/kg/dose twice daily.', 'stop'));
    await expect(make().complete({ system: 's', user: 'u' })).resolves.toMatchObject({
      text: 'Amoxicillin 40 mg/kg/dose twice daily.',
    });
  });

  it.each(['length', 'content_filter'])('throws when finish_reason is %s', async (reason) => {
    respond(openAiShape('Amoxicillin 40 mg/kg/dose twice da', reason));
    await expect(make().complete({ system: 's', user: 'u' })).rejects.toThrow(
      new RegExp(`incomplete answer.*${reason}`),
    );
  });

  it('throws on an empty answer', async () => {
    respond(openAiShape(null, 'stop'));
    await expect(make().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer.*empty/,
    );
  });
});

describe('Anthropic truncation guard', () => {
  afterEach(() => vi.unstubAllGlobals());
  const make = () => new AnthropicProvider(config, strictLog);
  const shape = (text: string, stop_reason: string) => ({
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-5',
    stop_reason,
  });

  it('returns a finished answer', async () => {
    respond(shape('Give ORS 75 mL/kg over 4 hours.', 'end_turn'));
    await expect(make().complete({ system: 's', user: 'u' })).resolves.toMatchObject({
      text: 'Give ORS 75 mL/kg over 4 hours.',
    });
  });

  it.each(['max_tokens', 'refusal'])('throws when stop_reason is %s', async (reason) => {
    respond(shape('Give ORS 75 mL/kg over', reason));
    await expect(make().complete({ system: 's', user: 'u' })).rejects.toThrow(
      new RegExp(`incomplete answer.*${reason}`),
    );
  });

  it('throws on an empty answer', async () => {
    respond(shape('', 'end_turn'));
    await expect(make().complete({ system: 's', user: 'u' })).rejects.toThrow(
      /incomplete answer.*empty/,
    );
  });
});
