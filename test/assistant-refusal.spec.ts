import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { ProviderRouter } from '../src/modules/agentic/providers/provider-router';
import type {
  LlmCompletionRequest,
  LlmProvider,
  LlmProviderName,
  ProviderCompletion,
} from '../src/modules/agentic/providers/llm-provider.interface';
import type { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { BundleTermStats } from '../src/modules/knowledge/grounding/term-stats';

/**
 * The backend cloud assistant used to have no hard gate for an ungrounded
 * clinical-claim question — only a soft system-prompt instruction — while the
 * mobile on-device model refused outright. Since 'cloud' is the mobile app's
 * default engine, most clinicians hit the unguarded path. This suite asserts
 * the backend now refuses BEFORE invoking the LLM at all, mirroring on-device.
 */

class FakeProvider implements LlmProvider {
  calls = 0;
  constructor(
    readonly name: LlmProviderName,
    readonly model: string,
  ) {}
  isConfigured(): boolean {
    return true;
  }
  async complete(_req: LlmCompletionRequest): Promise<ProviderCompletion> {
    this.calls++;
    return { text: 'answer', model: this.model, provider: this.name };
  }
}

function makeRouter(openrouter: FakeProvider): ProviderRouter {
  const args = [
    new FakeProvider('anthropic', 'claude-sonnet-5'),
    new FakeProvider('openai', 'gpt-4o'),
    new FakeProvider('deepseek', 'deepseek-chat'),
    new FakeProvider('gemini', 'gemini-2.0-flash'),
    openrouter,
  ] as unknown as ConstructorParameters<typeof ProviderRouter>;
  return new ProviderRouter(...args);
}

function makeEmptySearch(): KnowledgeSearchService {
  return {
    search: () => [],
    getRecord: () => null,
    termStats: () => new BundleTermStats([]),
    interactionsMentioning: () => [],
  } as unknown as KnowledgeSearchService;
}

// "Grounded" now means the placed record covers what was asked, so the stub
// record has to actually carry amoxicillin dosing for pneumonia.
const AMOXICILLIN = {
  slug: 'amoxicillin',
  inn: 'Amoxicillin',
  dosing: {
    adult: [{ indication: 'Community-acquired pneumonia', regimen: '500 mg three times daily' }],
  },
};

function makeGroundedSearch(): KnowledgeSearchService {
  return {
    search: () => [{ domain: 'drugs', slug: 'amoxicillin', title: 'Amoxicillin', snippet: 's' }],
    getRecord: () => AMOXICILLIN,
    termStats: () => new BundleTermStats([{ record: AMOXICILLIN }]),
    interactionsMentioning: () => [],
  } as unknown as KnowledgeSearchService;
}

describe('AssistantService — ungrounded clinical claim refusal', () => {
  const original = process.env.MEDICAL_MODEL_IDS;
  beforeEach(() => {
    process.env.MEDICAL_MODEL_IDS = 'google/medgemma-27b-text-it';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MEDICAL_MODEL_IDS;
    else process.env.MEDICAL_MODEL_IDS = original;
  });

  it('refuses a dose question with zero retrieved sources, without invoking the LLM', async () => {
    const or = new FakeProvider('openrouter', 'google/medgemma-27b-text-it');
    const svc = new AssistantService(makeEmptySearch(), makeRouter(or));
    const res = await svc.chat({ question: 'What is the dose of amoxicillin for pneumonia?' });
    expect(res.refused).toBe(true);
    expect(res.grounded).toBe(false);
    expect(res.provider).toBe('none');
    expect(or.calls).toBe(0);
  });

  it('does NOT refuse a general question with zero retrieved sources', async () => {
    const or = new FakeProvider('openrouter', 'google/medgemma-27b-text-it');
    const svc = new AssistantService(makeEmptySearch(), makeRouter(or));
    const res = await svc.chat({ question: 'What causes jaundice in newborns?' });
    expect(res.refused).toBe(false);
    expect(or.calls).toBe(1);
  });

  it('does not refuse a dose question when sources ARE retrieved', async () => {
    const or = new FakeProvider('openrouter', 'google/medgemma-27b-text-it');
    const svc = new AssistantService(makeGroundedSearch(), makeRouter(or));
    const res = await svc.chat({ question: 'What is the dose of amoxicillin for pneumonia?' });
    expect(res.refused).toBe(false);
    expect(res.grounded).toBe(true);
    expect(or.calls).toBe(1);
  });

  it('returns complete: true and refused: false for an empty question', async () => {
    const or = new FakeProvider('openrouter', 'google/medgemma-27b-text-it');
    const svc = new AssistantService(makeEmptySearch(), makeRouter(or));
    const res = await svc.chat({ question: '' });
    expect(res.refused).toBe(false);
    expect(res.complete).toBe(true);
    expect(or.calls).toBe(0);
  });
});
