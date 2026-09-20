#!/usr/bin/env ts-node
/**
 * Offline LLM safety evaluation of the agentic engine.
 *
 *   npm run eval:llm-safety -- --dry-run            # show payloads + judge prompt, no network
 *   npm run eval:llm-safety                         # run all cases, judge with Claude if keyed
 *   npm run eval:llm-safety -- --case altitude-spo2 --no-judge
 *   npm run eval:llm-safety -- --fail-on-check      # exit 1 if any deterministic check fails
 *
 * Sends each synthetic case in content/evals/llm-safety/cases.json to a
 * RUNNING VedaMD API (so it exercises whatever model that deployment is
 * configured with), runs the case's deterministic checks, and — when
 * ANTHROPIC_API_KEY is set — scores the response with the rubric from
 * Agweyu et al., Nature Health 2026 (see src/common/clinical-review/safety-rubric.ts).
 *
 * Env:
 *   VEDAMD_EVAL_BASE_URL   API base URL (default http://localhost:3000)
 *   VEDAMD_API_KEY         API key with the cds:evaluate scope
 *   ANTHROPIC_API_KEY      enables the rubric judge
 *   ANTHROPIC_JUDGE_MODEL  judge model (default claude-opus-5)
 *
 * Run it before and after every model change and compare the reports. The
 * judge is an LLM: its scores flag cases for a clinician to read, they do not
 * certify anything.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CdsCard } from '../src/modules/cds/cds.types';
import {
  runChecks,
  responseText,
  type EvalChecks,
} from '../src/common/clinical-review/eval-checks';
import {
  SAFETY_JUDGE_SYSTEM,
  STUDY_BASELINE,
  buildJudgePrompt,
  parseJudgeVerdict,
  summarizeVerdicts,
  type RubricVerdict,
} from '../src/common/clinical-review/safety-rubric';

interface EvalCase {
  id: string;
  failureMode: string;
  context: Record<string, unknown> & { question: string };
  checks: EvalChecks;
  reviewerNotes?: string;
}

interface CaseResult {
  id: string;
  failureMode: string;
  status: 'evaluated' | 'no-llm' | 'error';
  model?: string;
  checks?: { passed: boolean; failures: string[] };
  verdict?: RubricVerdict;
  judgeError?: string;
  error?: string;
  response?: string;
}

const ROOT = process.cwd();
const CASES_FILE = resolve(ROOT, 'content/evals/llm-safety/cases.json');
const OUT_DIR = resolve(ROOT, 'content/evals/llm-safety/results');

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** The clinician documentation the judge sees: the note plus structured fields. */
function documentation(c: EvalCase): string {
  const { question, ...structured } = c.context;
  return `${question}\n\nStructured context sent with the note: ${JSON.stringify(structured)}`;
}

async function evaluate(
  baseUrl: string,
  apiKey: string,
  c: EvalCase,
): Promise<{ cards: CdsCard[]; narrative?: string; model?: string; agenticInvoked: boolean }> {
  const res = await fetch(`${baseUrl}/v1/agentic/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...c.context, mode: 'agentic' }),
  });
  if (!res.ok) throw new Error(`evaluate HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    cards?: CdsCard[];
    meta?: { llmModel?: string; agenticInvoked?: boolean; narrative?: string };
  };
  return {
    cards: json.cards ?? [],
    narrative: json.meta?.narrative,
    model: json.meta?.llmModel,
    agenticInvoked: json.meta?.agenticInvoked ?? false,
  };
}

async function judge(c: EvalCase, response: string, key: string, model: string) {
  const res = await fetch(
    `${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SAFETY_JUDGE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: buildJudgePrompt(
              { id: c.id, documentation: documentation(c), reviewerNotes: c.reviewerNotes },
              response,
            ),
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
  const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return parseJudgeVerdict(text);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function markdown(meta: Record<string, unknown>, results: CaseResult[]): string {
  const evaluated = results.filter((r) => r.status === 'evaluated');
  const verdicts = evaluated.flatMap((r) => (r.verdict ? [r.verdict] : []));
  const s = summarizeVerdicts(verdicts);
  const checksPassed = evaluated.filter((r) => r.checks?.passed).length;
  const lines = [
    `# LLM safety eval`,
    ``,
    `Model: \`${meta.model}\` · run ${meta.ranAt} · ${evaluated.length}/${results.length} cases evaluated · judge: ${meta.judgeModel ?? 'none'}`,
    ``,
    `_Synthetic cases; judge scores are an automated screen. Read every failing case before drawing conclusions. ${results.length} cases are far too few for the rates below to be precise._`,
    ``,
    `**Deterministic checks:** ${checksPassed}/${evaluated.length} passed.`,
    ``,
  ];
  if (verdicts.length) {
    lines.push(
      `| Measure | This run | Study baseline (GPT-4o, no retrieval) |`,
      `|---|---|---|`,
      `| Hallucination | ${pct(s.hallucinationPct)} | ${STUDY_BASELINE.hallucinationPct}% |`,
      `| Any unsafe recommendation | ${pct(s.unsafePct)} | ${STUDY_BASELINE.unsafePct}% |`,
      `| Major safety concern | ${pct(s.majorUnsafePct)} | ${STUDY_BASELINE.majorUnsafePct}% |`,
      `| Guideline-aligned | ${pct(s.guidelineAlignedPct)} | ${STUDY_BASELINE.guidelineAlignedPct}% |`,
      `| Sycophancy | ${pct(s.sycophancyPct)} | not reported |`,
      `| Poor differential | ${pct(s.poorDifferentialPct)} | 1.7% |`,
      ``,
      `The study's cases were real encounters, not adversarial vignettes, so read the comparison as orientation only.`,
      ``,
    );
  }
  lines.push(
    `| Case | Failure mode | Checks | Unsafe | Halluc. | Notes |`,
    `|---|---|---|---|---|---|`,
  );
  for (const r of results) {
    const unsafe = r.verdict
      ? ({ 1: 'MAJOR', 2: 'minor', 3: 'no' } as Record<number, string>)[
          r.verdict.scores.unsafe_recommendation
        ]
      : '—';
    const notes = (
      r.error ??
      r.judgeError ??
      [...(r.checks?.failures ?? []), r.verdict?.rationale ?? ''].join('; ')
    )
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
    lines.push(
      `| ${r.id} | ${r.failureMode} | ${r.status !== 'evaluated' ? r.status : r.checks?.passed ? 'pass' : '**FAIL**'} | ${unsafe} | ${r.verdict ? (r.verdict.hallucination ? '**yes**' : 'no') : '—'} | ${notes} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function run() {
  const args = process.argv.slice(2);
  const file = JSON.parse(readFileSync(CASES_FILE, 'utf8')) as { cases: EvalCase[] };
  const only = arg(args, '--case');
  const cases = only ? file.cases.filter((c) => c.id === only) : file.cases;
  if (cases.length === 0) {
    console.error(`No case matches ${only}.`);
    process.exit(1);
  }

  if (args.includes('--dry-run')) {
    for (const c of cases)
      console.log(
        `${c.id}: POST /v1/agentic/evaluate ${JSON.stringify({ ...c.context, mode: 'agentic' })}`,
      );
    console.log(`\nJudge prompt for ${cases[0].id} (response placeholder):\n`);
    console.log(
      buildJudgePrompt(
        {
          id: cases[0].id,
          documentation: documentation(cases[0]),
          reviewerNotes: cases[0].reviewerNotes,
        },
        '<response>',
      ),
    );
    return;
  }

  const baseUrl = (
    arg(args, '--base-url') ??
    process.env.VEDAMD_EVAL_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const apiKey = process.env.VEDAMD_API_KEY ?? '';
  if (!apiKey) {
    console.error('Set VEDAMD_API_KEY (an API key with the cds:evaluate scope), or use --dry-run.');
    process.exit(1);
  }
  const judgeKey = args.includes('--no-judge') ? '' : (process.env.ANTHROPIC_API_KEY ?? '');
  const judgeModel = process.env.ANTHROPIC_JUDGE_MODEL ?? 'claude-opus-5';
  console.log(
    `Evaluating ${cases.length} case(s) against ${baseUrl}; judge: ${judgeKey ? judgeModel : 'off'}.`,
  );

  const results: CaseResult[] = [];
  for (const c of cases) {
    try {
      const out = await evaluate(baseUrl, apiKey, c);
      if (!out.agenticInvoked) {
        results.push({ id: c.id, failureMode: c.failureMode, status: 'no-llm' });
        process.stdout.write('-');
        continue;
      }
      const response = responseText(out.cards, out.narrative) || '(no cards returned)';
      const result: CaseResult = {
        id: c.id,
        failureMode: c.failureMode,
        status: 'evaluated',
        model: out.model,
        checks: runChecks(c.checks, out.cards, out.narrative),
        response,
      };
      if (judgeKey) {
        try {
          const parsed = await judge(c, response, judgeKey, judgeModel);
          if (parsed.ok) result.verdict = parsed.verdict;
          else result.judgeError = `judge: ${parsed.error}`;
        } catch (e) {
          result.judgeError = `judge: ${(e as Error).message}`;
        }
      }
      results.push(result);
      process.stdout.write(result.checks!.passed ? '.' : 'F');
    } catch (e) {
      results.push({
        id: c.id,
        failureMode: c.failureMode,
        status: 'error',
        error: (e as Error).message,
      });
      process.stdout.write('E');
    }
  }
  process.stdout.write('\n');

  const models = [...new Set(results.flatMap((r) => (r.model ? [r.model] : [])))];
  const model = models.join('+') || 'none';
  const ranAt = new Date().toISOString();
  const meta = {
    model,
    ranAt,
    baseUrl,
    judgeModel: judgeKey ? judgeModel : null,
    caseFileVersion: (file as { version?: string }).version,
  };
  const verdicts = results.flatMap((r) => (r.verdict ? [r.verdict] : []));
  const stem = `${ranAt.slice(0, 10)}-${model.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, `${stem}.json`),
    `${JSON.stringify({ ...meta, summary: summarizeVerdicts(verdicts), results }, null, 2)}\n`,
  );
  writeFileSync(resolve(OUT_DIR, `${stem}.md`), markdown(meta, results));
  console.log(`Wrote content/evals/llm-safety/results/${stem}.{json,md}`);

  const failed = results.filter((r) => r.status === 'evaluated' && !r.checks?.passed);
  const noLlm = results.filter((r) => r.status === 'no-llm').length;
  if (noLlm)
    console.warn(
      `${noLlm} case(s) skipped: the API ran without an LLM (no clinical-grade provider configured).`,
    );
  console.log(`${failed.length} case(s) failed deterministic checks.`);
  if (
    args.includes('--fail-on-check') &&
    (failed.length > 0 || results.some((r) => r.status !== 'evaluated'))
  ) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
