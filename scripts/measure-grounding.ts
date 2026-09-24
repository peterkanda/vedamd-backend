#!/usr/bin/env ts-node
/**
 * Measure the backend chat grounding gate against a labelled question set.
 *
 *   npm run eval:grounding -- --label baseline
 *   npm run eval:grounding -- --label after --compare baseline
 *
 * Runs every question in content/evals/grounding/questions.json through the
 * mobile cloud-chat path (AssistantService) and the reference chat
 * (ReferenceChatService) against the real signed bundle, with a stand-in
 * model that records what grounding was actually placed in its prompt. No
 * network, no API key.
 *
 * For each question it reports whether the surface refused, answered as
 * grounded, or answered as general knowledge, and — for questions labelled
 * `grounded` — whether the named subject and topic field (e.g. the drug's
 * `pregnancy` field) actually reached the model. Results are written to
 * content/evals/grounding/results/<label>.json; --compare prints what changed.
 *
 * This measures the gate, not answer quality: the model never answers.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { KnowledgeRetrieverService } from '../src/modules/agentic/knowledge-retriever.service';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { ReferenceChatService } from '../src/modules/reference/reference-chat.service';
import { ProviderRouter } from '../src/modules/agentic/providers/provider-router';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type {
  LlmCompletionRequest,
  LlmProvider,
  LlmProviderName,
  ProviderCompletion,
} from '../src/modules/agentic/providers/llm-provider.interface';

interface Question {
  id: string;
  q: string;
  expect: 'grounded' | 'refuse' | 'general';
  subject?: string;
  topic?: string;
  previous?: string;
}

type Outcome = 'refuse' | 'grounded' | 'general';

interface SurfaceResult {
  outcome: Outcome;
  llmCalled: boolean;
  subjectPlaced?: boolean;
  topicPlaced?: boolean;
  sources?: number;
  citations?: number;
  pass: boolean;
}

interface Row {
  id: string;
  expect: Question['expect'];
  assistant: SurfaceResult;
  reference: SurfaceResult;
}

const ROOT = resolve(__dirname, '..');
const MODEL = 'measure-grounding-stub';

class RecordingProvider implements LlmProvider {
  readonly model = MODEL;
  last: LlmCompletionRequest | null = null;
  constructor(readonly name: LlmProviderName) {}
  isConfigured(): boolean {
    return this.name === 'openai';
  }
  async complete(req: LlmCompletionRequest): Promise<ProviderCompletion> {
    this.last = req;
    return { text: 'stub answer', model: MODEL, provider: this.name };
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Whether a field key (e.g. "pregnancy") appears in the placed grounding. */
function fieldPlaced(text: string, topic: string): boolean {
  return new RegExp(`"${topic}\\w*"\\s*:|\\b${topic}\\w*:`, 'i').test(text);
}

function judge(
  q: Question,
  outcome: Outcome,
  subjectPlaced: boolean,
  topicPlaced: boolean,
): boolean {
  if (q.expect === 'refuse') return outcome === 'refuse';
  if (q.expect === 'general') return outcome !== 'refuse';
  return outcome === 'grounded' && subjectPlaced && (!q.topic || topicPlaced);
}

async function main(): Promise<void> {
  const label = arg('label') ?? 'run';
  const compare = arg('compare');
  process.env.MEDICAL_MODEL_IDS = MODEL;
  process.env.AGENTIC_PROVIDER = 'openai-only';

  const config = {
    get: (key: string) => {
      if (key === 'content.bundleDir') return resolve(ROOT, 'content/bundles/v0.1.0');
      if (key === 'content.strictVerification') return true;
      if (key === 'content.requireApproved') return false;
      if (key === 'content.snomedEnabled') return false;
      return undefined;
    },
  } as unknown as ConfigService<never, true>;
  const log = new PhiFreeLogger({
    service: 'measure',
    hashSecret: 's',
    strict: true,
    level: 'fatal',
  });
  const knowledge = new KnowledgeService(config as never, log);
  knowledge.loadFromConfig();

  const openai = new RecordingProvider('openai');
  const router = new ProviderRouter(
    ...([
      new RecordingProvider('anthropic'),
      openai,
      new RecordingProvider('deepseek'),
      new RecordingProvider('gemini'),
      new RecordingProvider('openrouter'),
    ] as unknown as ConstructorParameters<typeof ProviderRouter>),
  );
  const search = new KnowledgeSearchService(knowledge);
  const assistant = new AssistantService(search, router);
  const reference = new ReferenceChatService(
    new KnowledgeRetrieverService(knowledge),
    router,
    log,
    search,
  );

  const { questions } = JSON.parse(
    readFileSync(resolve(ROOT, 'content/evals/grounding/questions.json'), 'utf8'),
  ) as { questions: Question[] };

  const rows: Row[] = [];
  for (const q of questions) {
    // --- Mobile cloud chat ---
    openai.last = null;
    const res = await assistant.chat({
      question: q.q,
      conversation: q.previous
        ? [
            { role: 'user', content: q.previous },
            { role: 'assistant', content: '(previous answer)' },
          ]
        : undefined,
    });
    const placedA = openai.last?.user ?? '';
    const outcomeA: Outcome = res.refused ? 'refuse' : res.grounded ? 'grounded' : 'general';
    const subjA = q.subject ? placedA.toLowerCase().includes(q.subject) : false;
    const topA = q.topic ? fieldPlaced(placedA, q.topic) : false;
    const a: SurfaceResult = {
      outcome: outcomeA,
      llmCalled: openai.last !== null,
      subjectPlaced: q.subject ? subjA : undefined,
      topicPlaced: q.topic ? topA : undefined,
      sources: res.sources.length,
      pass: judge(q, outcomeA, subjA, topA),
    };

    // --- Reference chat (single-turn surface) ---
    openai.last = null;
    const ref = (await reference.ask(q.previous ? `${q.previous} ${q.q}` : q.q)) as {
      available: boolean;
      citations: unknown[];
      refused?: boolean;
      grounded?: boolean;
    };
    const placedR = openai.last?.user ?? '';
    const outcomeR: Outcome =
      ref.refused === true || !openai.last
        ? 'refuse'
        : ref.grounded === false
          ? 'general'
          : 'grounded';
    const subjR = q.subject ? placedR.toLowerCase().includes(q.subject) : false;
    const topR = q.topic ? fieldPlaced(placedR, q.topic) : false;
    const r: SurfaceResult = {
      outcome: outcomeR,
      llmCalled: openai.last !== null,
      subjectPlaced: q.subject ? subjR : undefined,
      topicPlaced: q.topic ? topR : undefined,
      citations: ref.citations.length,
      // Reference chat never answers from general knowledge: an uncovered
      // general question is a correct refusal there.
      pass: q.expect === 'general' ? true : judge(q, outcomeR, subjR, topR),
    };
    rows.push({ id: q.id, expect: q.expect, assistant: a, reference: r });
  }

  const summary = (surface: 'assistant' | 'reference') => {
    const by = (e: Question['expect']) => rows.filter((x) => x.expect === e);
    const pct = (xs: Row[]) => `${xs.filter((x) => x[surface].pass).length}/${xs.length}`;
    return {
      refuseCorrect: pct(by('refuse')),
      groundedCorrect: pct(by('grounded')),
      generalNotRefused: pct(by('general')),
      refusals: rows.filter((x) => x[surface].outcome === 'refuse').length,
    };
  };

  const out = {
    label,
    ranAt: new Date().toISOString(),
    questions: rows.length,
    assistant: summary('assistant'),
    reference: summary('reference'),
    rows,
  };
  const dir = resolve(ROOT, 'content/evals/grounding/results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${label}.json`), JSON.stringify(out, null, 2) + '\n');

  console.log(`Grounding gate — ${rows.length} questions (${label})`);
  for (const s of ['assistant', 'reference'] as const) {
    const m = out[s];
    console.log(
      `  ${s.padEnd(9)} refuse ✓ ${m.refuseCorrect}  grounded ✓ ${m.groundedCorrect}  general not refused ${m.generalNotRefused}  (total refusals ${m.refusals})`,
    );
  }
  console.log('\nFailures:');
  for (const x of rows) {
    for (const s of ['assistant', 'reference'] as const) {
      const r = x[s];
      if (r.pass) continue;
      const detail =
        x.expect === 'grounded'
          ? ` subject:${r.subjectPlaced ? 'y' : 'n'}${r.topicPlaced === undefined ? '' : ` topic:${r.topicPlaced ? 'y' : 'n'}`}`
          : '';
      console.log(`  [${s}] ${x.id}: expected ${x.expect}, got ${r.outcome}${detail}`);
    }
  }

  if (compare) {
    const prevFile = resolve(dir, `${compare}.json`);
    if (!existsSync(prevFile)) throw new Error(`no results named ${compare}`);
    const prev = JSON.parse(readFileSync(prevFile, 'utf8')) as typeof out;
    const prevById = new Map(prev.rows.map((x) => [x.id, x]));
    console.log(`\nChanges vs ${compare}:`);
    for (const x of rows) {
      const p = prevById.get(x.id);
      if (!p) continue;
      for (const s of ['assistant', 'reference'] as const) {
        if (p[s].outcome !== x[s].outcome || p[s].pass !== x[s].pass) {
          console.log(
            `  [${s}] ${x.id} (${x.expect}): ${p[s].outcome}${p[s].pass ? '✓' : '✗'} → ${x[s].outcome}${x[s].pass ? '✓' : '✗'}`,
          );
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
