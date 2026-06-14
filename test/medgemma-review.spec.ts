import { describe, expect, it } from 'vitest';
import {
  buildReviewPrompt,
  parseReviewVerdict,
  isFlagged,
} from '../src/common/clinical-review/medgemma-review';

describe('medgemma-review core', () => {
  it('builds a prompt that includes the content and cited sources', () => {
    const p = buildReviewPrompt({
      title: 'Uncomplicated malaria',
      domain: 'infectious-disease',
      jurisdiction: 'UG',
      content: '{"management":"AL first-line"}',
      references: [{ label: 'Uganda Clinical Guidelines', url: 'https://health.go.ug' }],
    });
    expect(p).toContain('Uncomplicated malaria');
    expect(p).toContain('AL first-line');
    expect(p).toContain('Uganda Clinical Guidelines');
    expect(p).toMatch(/JSON/i);
  });

  it('parses a clean JSON verdict', () => {
    const r = parseReviewVerdict('{"verdict":"ok","dosingConcern":false,"issues":[],"confidence":0.9}');
    expect(r.verdict).toBe('ok');
    expect(r.confidence).toBeCloseTo(0.9);
    expect(isFlagged(r)).toBe(false);
  });

  it('parses a verdict wrapped in prose/code fences and flags concerns', () => {
    const r = parseReviewVerdict(
      'Here is my review:\n```json\n{"verdict":"error","dosingConcern":true,"issues":["wrong first-line"],"suggestion":"use X","confidence":0.8}\n```',
    );
    expect(r.verdict).toBe('error');
    expect(r.dosingConcern).toBe(true);
    expect(r.issues).toEqual(['wrong first-line']);
    expect(r.suggestion).toBe('use X');
    expect(isFlagged(r)).toBe(true);
  });

  it('falls back to a conservative "unknown" (flagged) on unparseable output', () => {
    const r = parseReviewVerdict('the model rambled without any json');
    expect(r.verdict).toBe('unknown');
    expect(isFlagged(r)).toBe(true);
    expect(r.confidence).toBe(0);
  });

  it('clamps confidence and ignores an invalid verdict', () => {
    const r = parseReviewVerdict('{"verdict":"definitely","confidence":5}');
    expect(r.verdict).toBe('unknown');
    expect(r.confidence).toBe(1);
  });
});
