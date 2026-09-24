import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { ProviderRouter } from '../src/modules/agentic/providers/provider-router';
import { makeKnowledgeService } from './helpers/knowledge';
import type {
  LlmCompletionRequest,
  LlmProvider,
  LlmProviderName,
  ProviderCompletion,
} from '../src/modules/agentic/providers/llm-provider.interface';

/**
 * Grounding + refusal against the REAL signed bundle, not a mocked search.
 *
 * The refusal gate's unit tests stub the search service, so they can prove
 * the gate fires but say nothing about how often it fires in practice. That
 * gap hid a serious regression: KnowledgeSearchService AND-gates every query
 * token, so "amoxicillin dose" scored zero against a bundle that documents
 * amoxicillin thoroughly, and arming the gate on top of that would have
 * refused essentially every dosing question on the app's default engine.
 *
 * These tests pin both directions — a covered question must be answered
 * from real records, an uncovered one must still be refused.
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

const MEDICAL = 'google/medgemma-27b-text-it';

function makeService(): { svc: AssistantService; provider: FakeProvider } {
  const knowledge = makeKnowledgeService();
  const search = new KnowledgeSearchService(knowledge);
  const provider = new FakeProvider('openrouter', MEDICAL);
  const args = [
    new FakeProvider('anthropic', 'claude-sonnet-5'),
    new FakeProvider('openai', 'gpt-4o'),
    new FakeProvider('deepseek', 'deepseek-chat'),
    new FakeProvider('gemini', 'gemini-2.0-flash'),
    provider,
  ] as unknown as ConstructorParameters<typeof ProviderRouter>;
  return { svc: new AssistantService(search, new ProviderRouter(...args)), provider };
}

describe('AssistantService grounding against the real bundle', () => {
  const original = process.env.MEDICAL_MODEL_IDS;
  beforeEach(() => {
    process.env.MEDICAL_MODEL_IDS = MEDICAL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MEDICAL_MODEL_IDS;
    else process.env.MEDICAL_MODEL_IDS = original;
  });

  // Regression: every one of these scored zero hits before the retrieval
  // fallback, which would have made the refusal gate reject them all.
  const covered: [string, string][] = [
    ['What is the dose of amoxicillin for pneumonia?', 'amoxicillin'],
    ['What is the paediatric dose of paracetamol?', 'paracetamol'],
    ['Is metformin contraindicated in renal impairment?', 'metformin'],
    ['ceftriaxone dose in meningitis', 'ceftriaxone'],
    ['Does warfarin interact with fluconazole?', 'warfarin'],
  ];

  for (const [question, expectedSlug] of covered) {
    it(`answers and cites real content: "${question}"`, async () => {
      const { svc, provider } = makeService();
      const res = await svc.chat({ question });
      expect(res.refused).toBe(false);
      expect(res.grounded).toBe(true);
      expect(res.sources.some((s) => s.slug === expectedSlug)).toBe(true);
      expect(provider.calls).toBe(1);
    });
  }

  it('still refuses a dosing question about a drug the bundle does not cover', async () => {
    const { svc, provider } = makeService();
    const res = await svc.chat({
      question: 'What is the dose of flibanserinium for zygomycosis?',
    });
    expect(res.refused).toBe(true);
    expect(res.grounded).toBe(false);
    expect(res.sources).toHaveLength(0);
    // The gate must fail closed without ever reaching the model.
    expect(provider.calls).toBe(0);
  });

  it('does not manufacture grounding from generic words alone', async () => {
    const { svc, provider } = makeService();
    const res = await svc.chat({ question: 'qwertyuiop dose for asdfghjkl' });
    expect(res.refused).toBe(true);
    expect(provider.calls).toBe(0);
  });
});

describe('AssistantService coverage gate (real bundle)', () => {
  const original = process.env.MEDICAL_MODEL_IDS;
  beforeEach(() => {
    process.env.MEDICAL_MODEL_IDS = MEDICAL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MEDICAL_MODEL_IDS;
    else process.env.MEDICAL_MODEL_IDS = original;
  });

  class Recording extends FakeProvider {
    last: LlmCompletionRequest | null = null;
    override async complete(req: LlmCompletionRequest): Promise<ProviderCompletion> {
      this.last = req;
      return super.complete(req);
    }
  }
  function make() {
    const knowledge = makeKnowledgeService();
    const provider = new Recording('openrouter', MEDICAL);
    const args = [
      new FakeProvider('anthropic', 'claude-sonnet-5'),
      new FakeProvider('openai', 'gpt-4o'),
      new FakeProvider('deepseek', 'deepseek-chat'),
      new FakeProvider('gemini', 'gemini-2.0-flash'),
      provider,
    ] as unknown as ConstructorParameters<typeof ProviderRouter>;
    const svc = new AssistantService(
      new KnowledgeSearchService(knowledge),
      new ProviderRouter(...args),
    );
    return { svc, provider };
  }

  // A migraine record mentions zolmitriptan in its management text but says
  // nothing about pregnancy; the word "pregnancy" alone used to ground this.
  it('refuses zolmitriptan-in-pregnancy without calling the model', async () => {
    const { svc, provider } = make();
    const res = await svc.chat({ question: 'Is zolmitriptan safe in pregnancy?' });
    expect(res.refused).toBe(true);
    expect(res.sources).toEqual([]);
    expect(provider.calls).toBe(0);
  });

  // 488 of 855 drug records used to lose their pregnancy field to a
  // fixed-length cut; the field the question asks about now goes first.
  it('grounds metformin-in-pregnancy on the pregnancy field itself', async () => {
    const { svc, provider } = make();
    const res = await svc.chat({ question: 'Is metformin safe in pregnancy?' });
    expect(res.grounded).toBe(true);
    expect(provider.last?.user).toMatch(/"pregnancy"\s*:/);
  });

  it('reads a bare follow-up with the previous question (dose asked in two turns)', async () => {
    const { svc, provider } = make();
    const res = await svc.chat({
      question: 'and for a 2 year old?',
      conversation: [
        { role: 'user', content: 'What is the dose of sotagliflozin?' },
        { role: 'assistant', content: 'I could not find that.' },
      ],
    });
    expect(res.refused).toBe(true);
    expect(provider.calls).toBe(0);
  });

  it('places the interaction record for an interaction question', async () => {
    const { svc, provider } = make();
    const res = await svc.chat({ question: 'Rifampicin and oral contraceptive interaction' });
    expect(res.grounded).toBe(true);
    expect(provider.last?.user).toMatch(/combined-oral-contraceptive/);
    expect(provider.last?.user).toMatch(/"severity"\s*:/);
  });

  it('never cuts a grounding record inside a value', async () => {
    const { svc, provider } = make();
    await svc.chat({ question: 'Paracetamol dose for a 15 kg child' });
    const user = provider.last?.user ?? '';
    // Every placed record is complete JSON.
    for (const line of user.split('\n').filter((l) => l.startsWith('{'))) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
