import { describe, expect, it } from 'vitest';
import {
  classify,
  lmsAt,
  lmsValueAtZ,
  lmsZ,
  scoreGrowth,
  usesWhoTailAdjustment,
  whoAdjustedZ,
  type LmsTable,
} from '../src/modules/growth/zscore';

/**
 * Shape of the WHO weight-for-age boys standard. The L/M/S values here are
 * illustrative, not the published table — `npm run growth:ingest` fetches
 * the real one. These tests pin the arithmetic and the classification
 * boundaries, which are what a wrong answer would turn on.
 */
const WFA_BOYS: LmsTable = {
  indicator: 'wfa',
  sex: 'male',
  xUnit: 'months',
  points: [
    { x: 0, l: 0.3487, m: 3.3464, s: 0.14602 },
    { x: 1, l: 0.2297, m: 4.4709, s: 0.13395 },
    { x: 2, l: 0.197, m: 5.5675, s: 0.12385 },
    { x: 12, l: 0.0, m: 9.6479, s: 0.10958 },
    { x: 24, l: -0.1507, m: 12.1515, s: 0.10903 },
  ],
};

describe('LMS arithmetic', () => {
  it('scores the median as exactly zero', () => {
    for (const p of WFA_BOYS.points) expect(lmsZ(p.m, p)).toBeCloseTo(0, 12);
  });

  it('inverts cleanly — the value at z scores back to z', () => {
    const p = WFA_BOYS.points[0];
    for (const z of [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
      expect(lmsZ(lmsValueAtZ(z, p), p)).toBeCloseTo(z, 10);
    }
  });

  it('uses the log form when L is zero', () => {
    const p = { l: 0, m: 9.6479, s: 0.10958 };
    expect(lmsZ(10.5, p)).toBeCloseTo(Math.log(10.5 / 9.6479) / 0.10958, 12);
  });

  it('rejects a non-positive measurement rather than returning a number', () => {
    expect(Number.isNaN(lmsZ(0, WFA_BOYS.points[0]))).toBe(true);
    expect(Number.isNaN(lmsZ(-1, WFA_BOYS.points[0]))).toBe(true);
  });

  it('rises monotonically with the measurement', () => {
    const p = WFA_BOYS.points[2];
    let prev = -Infinity;
    for (let w = 2; w <= 12; w += 0.5) {
      const z = lmsZ(w, p);
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });
});

describe('WHO tail adjustment', () => {
  const p = WFA_BOYS.points[2];

  it('leaves the score untouched inside ±3 SD', () => {
    for (const z of [-3, -2, 0, 2, 3]) {
      const v = lmsValueAtZ(z, p);
      expect(whoAdjustedZ(v, p)).toBeCloseTo(lmsZ(v, p), 10);
    }
  });

  it('is continuous across the ±3 SD boundary', () => {
    // A discontinuity here would move a child across the SAM threshold on a
    // few grams, so the two branches must meet.
    const justInside = lmsValueAtZ(-3, p) * 1.0000001;
    const justOutside = lmsValueAtZ(-3, p) * 0.9999999;
    expect(whoAdjustedZ(justOutside, p)).toBeCloseTo(whoAdjustedZ(justInside, p), 4);
  });

  it('stays monotonic through the tail', () => {
    let prev = -Infinity;
    for (let w = 1.5; w <= 12; w += 0.25) {
      const z = whoAdjustedZ(w, p);
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });

  it('applies only to the weight-based indicators', () => {
    expect(usesWhoTailAdjustment('wfa')).toBe(true);
    expect(usesWhoTailAdjustment('wfl')).toBe(true);
    expect(usesWhoTailAdjustment('bfa')).toBe(true);
    expect(usesWhoTailAdjustment('lhfa')).toBe(false);
  });
});

describe('interpolation between published rows', () => {
  it('returns a published row exactly', () => {
    expect(lmsAt(WFA_BOYS, 1)).toEqual(WFA_BOYS.points[1]);
  });

  it('interpolates linearly between neighbours', () => {
    const at = lmsAt(WFA_BOYS, 1.5)!;
    expect(at.m).toBeCloseTo((4.4709 + 5.5675) / 2, 10);
    expect(at.l).toBeCloseTo((0.2297 + 0.197) / 2, 10);
  });

  it('refuses to extrapolate past the ends of the chart', () => {
    // A standard has an age range; guessing past it silently would be worse
    // than saying the chart does not cover this child.
    expect(lmsAt(WFA_BOYS, -1)).toBeNull();
    expect(lmsAt(WFA_BOYS, 60)).toBeNull();
  });
});

describe('scoreGrowth', () => {
  it('reports the median child as z 0 at the 50th centile', () => {
    const r = scoreGrowth(WFA_BOYS, 12, 9.6479)!;
    expect(r.z).toBe(0);
    expect(r.percentile).toBeCloseTo(50, 0);
    expect(r.median).toBeCloseTo(9.6479, 2);
  });

  it('classifies a severely underweight child', () => {
    const p = lmsAt(WFA_BOYS, 12)!;
    const r = scoreGrowth(WFA_BOYS, 12, lmsValueAtZ(-3.5, p))!;
    expect(r.z).toBeLessThan(-3);
    expect(r.classification).toContain('Severely underweight');
  });

  it('returns null when the chart does not cover the child', () => {
    expect(scoreGrowth(WFA_BOYS, 60, 18)).toBeNull();
  });
});

describe('classification thresholds', () => {
  it('matches the cut-offs written into growth-development.json', () => {
    expect(classify('wfa', -2.1)).toContain('Underweight');
    expect(classify('wfa', -3.1)).toContain('Severely underweight');
    expect(classify('wfa', -1.9)).toContain('within the reference range');
    expect(classify('wfh', -3.1)).toContain('Severe acute malnutrition');
    expect(classify('wfh', -2.5)).toContain('Moderate acute malnutrition');
    expect(classify('lhfa', -2.5)).toContain('Stunted');
    expect(classify('lhfa', -3.5)).toContain('Severely stunted');
  });

  it('puts the boundary on the WHO side — exactly -2 SD is not yet a diagnosis', () => {
    expect(classify('wfa', -2)).toContain('within the reference range');
    expect(classify('wfh', -3)).toContain('Moderate acute malnutrition');
  });
});
