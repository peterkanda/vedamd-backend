import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CdsCard } from '../src/modules/cds/cds.types';
import { runChecks } from '../src/common/clinical-review/eval-checks';
import {
  SAFETY_RUBRIC,
  buildJudgePrompt,
  parseJudgeVerdict,
  summarizeVerdicts,
  type RubricVerdict,
} from '../src/common/clinical-review/safety-rubric';

const cleanScores = Object.fromEntries(SAFETY_RUBRIC.map((i) => [i.id, 1]));
const safe = { ...cleanScores, unsafe_recommendation: 3 };

function card(indicator: CdsCard['indicator'], summary: string, agentic = true): CdsCard {
  return {
    summary,
    indicator,
    source: { label: 'x' },
    extension: {
      'http://vedamd.io/Card/recommendation': {
        ruleId: agentic ? 'agentic-reasoner' : 'ddi-check',
        ruleVersion: '0.1.0',
        evidenceLevel: 'expert-consensus',
      } as never,
    },
  };
}

describe('safety rubric judge parsing', () => {
  it('accepts a complete verdict wrapped in prose', () => {
    const parsed = parseJudgeVerdict(
      `Here you go: ${JSON.stringify({ scores: safe, hallucination: false, sycophancy: false, unsafeTypes: [], rationale: 'fine' })}`,
    );
    expect(parsed.ok).toBe(true);
  });

  it('rejects a verdict missing a rubric item', () => {
    const partial: Record<string, number> = { ...safe };
    delete partial.unsafe_recommendation;
    const parsed = parseJudgeVerdict(
      JSON.stringify({ scores: partial, hallucination: false, sycophancy: false, unsafeTypes: [] }),
    );
    expect(parsed).toEqual({
      ok: false,
      error: 'missing or invalid score for unsafe_recommendation',
    });
  });

  it('rejects an out-of-range score', () => {
    const parsed = parseJudgeVerdict(
      JSON.stringify({
        scores: { ...safe, align_local: 9 },
        hallucination: false,
        sycophancy: false,
      }),
    );
    expect(parsed.ok).toBe(false);
  });

  it('requires a concern type when a safety concern is scored', () => {
    const parsed = parseJudgeVerdict(
      JSON.stringify({
        scores: { ...safe, unsafe_recommendation: 1 },
        hallucination: false,
        sycophancy: false,
        unsafeTypes: [],
      }),
    );
    expect(parsed.ok).toBe(false);
  });

  it('summarises rates in the study’s terms', () => {
    const base: RubricVerdict = {
      scores: safe,
      hallucination: false,
      sycophancy: false,
      unsafeTypes: [],
      rationale: '',
    };
    const s = summarizeVerdicts([
      base,
      {
        ...base,
        hallucination: true,
        scores: { ...safe, unsafe_recommendation: 1, align_local: 3 },
        unsafeTypes: [2],
      },
    ]);
    expect(s).toMatchObject({
      judged: 2,
      hallucinationPct: 50,
      unsafePct: 50,
      majorUnsafePct: 50,
      guidelineAlignedPct: 50,
      unsafeTypeCounts: { 'Omission of critical differential diagnoses': 1 },
    });
  });

  it('puts the documentation, response and every rubric item in the judge prompt', () => {
    const prompt = buildJudgePrompt({ id: 'c1', documentation: 'NOTE TEXT' }, 'RESPONSE TEXT');
    expect(prompt).toContain('NOTE TEXT');
    expect(prompt).toContain('RESPONSE TEXT');
    for (const item of SAFETY_RUBRIC) expect(prompt).toContain(item.id);
  });
});

describe('eval deterministic checks', () => {
  it('fails on a forbidden expansion and passes without it', () => {
    const checks = { mustNotMatch: ['genital'] };
    expect(runChecks(checks, [card('info', 'FGC read as female genital cutting')]).passed).toBe(
      false,
    );
    expect(runChecks(checks, [card('info', 'Plan appropriate for viral URTI')]).passed).toBe(true);
  });

  it('enforces minimum severity', () => {
    const checks = { mustMatchAll: ['pregnan'], minIndicator: 'warning' as const };
    expect(runChecks(checks, [card('info', 'Consider pregnancy test')]).failures).toEqual([
      'expected a card of at least "warning" severity',
    ]);
    expect(runChecks(checks, [card('warning', 'Exclude pregnancy / ectopic')]).passed).toBe(true);
  });

  it('with agenticOnly, ignores rule cards for the padding check', () => {
    const checks = { agenticOnly: true, maxIndicator: 'info' as const };
    expect(
      runChecks(checks, [card('warning', 'rule card', false), card('info', 'ok')]).passed,
    ).toBe(true);
    expect(runChecks(checks, [card('warning', 'padding')]).passed).toBe(false);
  });

  it('every case file entry has a valid context and compilable patterns', () => {
    const file = JSON.parse(
      readFileSync(resolve(__dirname, '../content/evals/llm-safety/cases.json'), 'utf8'),
    ) as {
      cases: Array<{ id: string; context: { question?: string }; checks: Record<string, unknown> }>;
    };
    const ids = new Set<string>();
    for (const c of file.cases) {
      expect(ids.has(c.id), `duplicate id ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(typeof c.context.question).toBe('string');
      const patterns = [
        ...((c.checks.mustMatchAll as string[]) ?? []),
        ...((c.checks.mustNotMatch as string[]) ?? []),
      ];
      for (const p of patterns) expect(() => new RegExp(p, 'i')).not.toThrow();
    }
    expect(file.cases.length).toBeGreaterThanOrEqual(10);
  });
});
