import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { ProviderRouter } from '../src/modules/agentic/providers/provider-router';
import {
  NoMedicalProviderError,
  isMedicalModel,
} from '../src/modules/agentic/providers/llm-provider.interface';
import type {
  LlmCompletionRequest,
  LlmProvider,
  LlmProviderName,
  ProviderCompletion,
} from '../src/modules/agentic/providers/llm-provider.interface';

/**
 * The router used to catch every provider error silently and fall through to
 * the next one, while /capabilities kept advertising MedGemma. A clinician
 * could therefore be answered by GPT-4o under a MedGemma badge. Clinical calls
 * now pass `requireMedical` and must refuse instead of substituting.
 */

class FakeProvider implements LlmProvider {
  calls = 0;
  constructor(
    readonly name: LlmProviderName,
    readonly model: string,
    private readonly behaviour: 'ok' | 'throw' = 'ok',
    private readonly configured = true,
    /** Model id the API reports back, when it differs from the configured one. */
    private readonly reportedModel = model,
  ) {}
  isConfigured(): boolean {
    return this.configured;
  }
  async complete(_req: LlmCompletionRequest): Promise<ProviderCompletion> {
    this.calls++;
    if (this.behaviour === 'throw') throw new Error(`${this.name} is unavailable`);
    return { text: 'answer', model: this.reportedModel, provider: this.name };
  }
}

const MEDICAL = 'google/medgemma-27b-text-it';
const GENERAL = 'gpt-4o';

function makeRouter(openrouter: FakeProvider, openai: FakeProvider) {
  // The router's constructor takes the concrete provider classes (Nest injects
  // by class token), so the fakes are cast to that shape. They satisfy the
  // LlmProvider interface, which is all the router actually uses.
  const args = [
    new FakeProvider('anthropic', 'claude-sonnet-5', 'ok', false),
    openai,
    new FakeProvider('deepseek', 'deepseek-chat', 'ok', false),
    new FakeProvider('gemini', 'gemini-2.0-flash', 'ok', false),
    openrouter,
  ] as unknown as ConstructorParameters<typeof ProviderRouter>;
  return new ProviderRouter(...args);
}

const clinical: LlmCompletionRequest = { system: 's', user: 'u', requireMedical: true };
const general: LlmCompletionRequest = { system: 's', user: 'u' };

describe('medical-model enforcement', () => {
  const original = process.env.MEDICAL_MODEL_IDS;
  const originalProvider = process.env.AGENTIC_PROVIDER;

  beforeEach(() => {
    process.env.MEDICAL_MODEL_IDS = MEDICAL;
    delete process.env.AGENTIC_PROVIDER;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MEDICAL_MODEL_IDS;
    else process.env.MEDICAL_MODEL_IDS = original;
    if (originalProvider === undefined) delete process.env.AGENTIC_PROVIDER;
    else process.env.AGENTIC_PROVIDER = originalProvider;
  });

  it('answers a clinical request from the declared medical model', async () => {
    const or = new FakeProvider('openrouter', MEDICAL);
    const oa = new FakeProvider('openai', GENERAL);
    const result = await makeRouter(or, oa).complete(clinical);
    expect(result.model).toBe(MEDICAL);
    expect(result.medical).toBe(true);
    expect(oa.calls).toBe(0);
  });

  it('counts an approved model as medical when the API reports a dated snapshot of it', async () => {
    process.env.MEDICAL_MODEL_IDS = GENERAL;
    const oa = new FakeProvider('openai', GENERAL, 'ok', true, `${GENERAL}-2024-08-06`);
    const or = new FakeProvider('openrouter', MEDICAL, 'ok', false);
    const result = await makeRouter(or, oa).complete(clinical);
    expect(result.model).toBe(`${GENERAL}-2024-08-06`);
    expect(result.medical).toBe(true);
  });

  it('refuses rather than falling back to a general-purpose model', async () => {
    const or = new FakeProvider('openrouter', MEDICAL, 'throw');
    const oa = new FakeProvider('openai', GENERAL);
    await expect(makeRouter(or, oa).complete(clinical)).rejects.toBeInstanceOf(
      NoMedicalProviderError,
    );
    // The crux: the general-purpose provider must never be reached.
    expect(oa.calls).toBe(0);
  });

  it('refuses when no medical model is configured at all', async () => {
    const or = new FakeProvider('openrouter', 'google/gemma-3-27b-it'); // not declared medical
    const oa = new FakeProvider('openai', GENERAL);
    await expect(makeRouter(or, oa).complete(clinical)).rejects.toBeInstanceOf(
      NoMedicalProviderError,
    );
    expect(or.calls).toBe(0);
    expect(oa.calls).toBe(0);
  });

  it('still falls back for non-clinical requests, and says it fell back', async () => {
    process.env.AGENTIC_PROVIDER = 'openrouter';
    const or = new FakeProvider('openrouter', MEDICAL, 'throw');
    const oa = new FakeProvider('openai', GENERAL);
    const result = await makeRouter(or, oa).complete(general);
    expect(result.provider).toBe('openai');
    expect(result.medical).toBe(false);
    expect(result.fellBackFrom).toBe('openrouter');
  });

  it('reports no fallback when the first choice answers', async () => {
    const or = new FakeProvider('openrouter', MEDICAL);
    const result = await makeRouter(or, new FakeProvider('openai', GENERAL)).complete(general);
    expect(result.fellBackFrom).toBeNull();
  });

  it('lists only declared medical providers', () => {
    const router = makeRouter(
      new FakeProvider('openrouter', MEDICAL),
      new FakeProvider('openai', GENERAL),
    );
    expect(router.medicalProviders().map((p) => p.name)).toEqual(['openrouter']);
  });
});

describe('medical model declaration', () => {
  const original = process.env.MEDICAL_MODEL_IDS;
  afterEach(() => {
    if (original === undefined) delete process.env.MEDICAL_MODEL_IDS;
    else process.env.MEDICAL_MODEL_IDS = original;
  });

  it('matches exact ids only, case-insensitively', () => {
    process.env.MEDICAL_MODEL_IDS = 'google/medgemma-27b-text-it, medgemma-4b-it';
    expect(isMedicalModel('google/medgemma-27b-text-it')).toBe(true);
    expect(isMedicalModel('MedGemma-4b-it')).toBe(true);
    expect(isMedicalModel('gpt-4o')).toBe(false);
  });

  it('does not bless a model merely for having "med" in its name', () => {
    process.env.MEDICAL_MODEL_IDS = 'google/medgemma-27b-text-it';
    expect(isMedicalModel('some-medical-sounding-model')).toBe(false);
    expect(isMedicalModel('medgemma-27b-text-it')).toBe(false); // not the declared id
  });
});
