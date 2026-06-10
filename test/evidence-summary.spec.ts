import { describe, expect, it } from 'vitest';
import { evidenceSummary } from '../src/common/evidence/evidence-summary';
import { annotateEvidence } from '../src/common/evidence/evidence-summary.interceptor';

describe('evidenceSummary', () => {
  it('rolls up A–D counts and picks the strongest as best', () => {
    const s = evidenceSummary([
      { label: 'x', strength: 'A' },
      { label: 'y', strength: 'C' },
      { label: 'z', strength: 'C' },
    ]);
    expect(s).toEqual({ best: 'A', counts: { A: 1, B: 0, C: 2, D: 0 }, graded: 3, total: 3 });
  });

  it('counts ungraded references in total but not in graded', () => {
    const s = evidenceSummary([{ label: 'x', strength: 'B' }, { label: 'y' }]);
    expect(s).toMatchObject({ best: 'B', graded: 1, total: 2 });
  });

  it('returns null for empty / non-array', () => {
    expect(evidenceSummary([])).toBeNull();
    expect(evidenceSummary(undefined)).toBeNull();
  });
});

describe('annotateEvidence (interceptor transform)', () => {
  it('attaches evidenceSummary next to a references array', () => {
    const out = annotateEvidence({ slug: 'x', references: [{ label: 'r', strength: 'A' }] }) as {
      evidenceSummary?: { best: string };
    };
    expect(out.evidenceSummary?.best).toBe('A');
  });

  it('annotates references nested inside list wrappers', () => {
    const out = annotateEvidence({
      conditions: [{ slug: 'a', references: [{ label: 'r', strength: 'B' }] }],
    }) as { conditions: Array<{ evidenceSummary?: { best: string } }> };
    expect(out.conditions[0].evidenceSummary?.best).toBe('B');
  });

  it('does NOT mutate the input (copy-on-write) and returns same ref when nothing changes', () => {
    const input = { slug: 'x', references: [{ label: 'r', strength: 'A' }] };
    const out = annotateEvidence(input);
    expect(out).not.toBe(input);
    expect((input as { evidenceSummary?: unknown }).evidenceSummary).toBeUndefined(); // original untouched

    const noRefs = { slug: 'y', title: 'no refs here' };
    expect(annotateEvidence(noRefs)).toBe(noRefs); // unchanged → same reference
  });

  it('leaves non-content payloads alone', () => {
    const payload = { status: 'ok', token: 'abc' };
    expect(annotateEvidence(payload)).toBe(payload);
  });
});
