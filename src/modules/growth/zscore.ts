/**
 * WHO Child Growth Standards z-scores from LMS parameters.
 *
 * `growth-development.json` states its thresholds in z-scores — "Underweight
 * is weight-for-age below -2 SD", "WAZ below -3 SD (severely underweight)",
 * the IMAM classification, the MUAC cut-offs — but nothing in the platform
 * could compute a z-score, because the bundle carries no LMS parameters. The
 * records told a clinician what the cut-off meant and then could not apply
 * it. This is the arithmetic that closes that gap; the tables it needs are
 * fetched by `npm run growth:ingest`.
 */

/** One age (or length) point of a WHO/CDC growth standard. */
export interface LmsPoint {
  /** Age in months, or length/height in cm for the weight-for-length charts. */
  x: number;
  /** Box-Cox power. */
  l: number;
  /** Median. */
  m: number;
  /** Coefficient of variation. */
  s: number;
}

export type Sex = 'male' | 'female';

export interface LmsTable {
  indicator: string;
  sex: Sex;
  /** What `x` measures, so a caller cannot pass an age to a length chart. */
  xUnit: 'months' | 'cm';
  points: LmsPoint[];
}

/**
 * Raw LMS z-score.
 *
 * Z = ((X/M)^L - 1) / (L * S), or ln(X/M) / S when L is zero.
 */
export function lmsZ(value: number, { l, m, s }: Pick<LmsPoint, 'l' | 'm' | 's'>): number {
  if (value <= 0 || m <= 0 || s <= 0) return Number.NaN;
  return l === 0 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
}

/** The measurement at a given z-score — the inverse of `lmsZ`. */
export function lmsValueAtZ(z: number, { l, m, s }: Pick<LmsPoint, 'l' | 'm' | 's'>): number {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/**
 * WHO-adjusted z-score for the weight-based indicators.
 *
 * Beyond ±3 SD the LMS curve is not trusted for weight — the Box-Cox tail
 * runs away from the observed distribution — so WHO replaces it with a
 * linear extrapolation in units of the outermost SD interval. Without this
 * a severely wasted child's WHZ is overstated, which is precisely the
 * reading that decides whether they are admitted for SAM.
 *
 * Applies to weight-for-age, weight-for-length/height and BMI-for-age; the
 * length- and head-circumference-for-age standards use the raw score.
 */
export function whoAdjustedZ(value: number, p: Pick<LmsPoint, 'l' | 'm' | 's'>): number {
  const z = lmsZ(value, p);
  if (!Number.isFinite(z) || Math.abs(z) <= 3) return z;
  if (z > 3) {
    const sd3 = lmsValueAtZ(3, p);
    const sd2 = lmsValueAtZ(2, p);
    return 3 + (value - sd3) / (sd3 - sd2);
  }
  const sd3neg = lmsValueAtZ(-3, p);
  const sd2neg = lmsValueAtZ(-2, p);
  return -3 + (value - sd3neg) / (sd2neg - sd3neg);
}

/** Indicators whose tails WHO rescales rather than trusting the LMS curve. */
const WEIGHT_BASED = new Set(['wfa', 'wfl', 'wfh', 'bfa']);

export function usesWhoTailAdjustment(indicator: string): boolean {
  return WEIGHT_BASED.has(indicator.toLowerCase());
}

/**
 * Interpolate LMS parameters at `x`.
 *
 * WHO publishes whole-month and whole-centimetre rows; a child is rarely
 * exactly on one. Linear interpolation between the neighbouring rows is what
 * the WHO Anthro software does, and is well behaved because L, M and S all
 * vary smoothly. Outside the table we return null rather than extrapolating:
 * a standard has an age range, and guessing past it silently would be worse
 * than saying the chart does not cover this child.
 */
export function lmsAt(table: LmsTable, x: number): LmsPoint | null {
  const pts = table.points;
  if (pts.length === 0) return null;
  if (x < pts[0].x || x > pts[pts.length - 1].x) return null;

  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  if (a.x === x) return a;
  if (b.x === x) return b;
  const w = (x - a.x) / (b.x - a.x);
  return {
    x,
    l: a.l + w * (b.l - a.l),
    m: a.m + w * (b.m - a.m),
    s: a.s + w * (b.s - a.s),
  };
}

export interface ZScoreResult {
  indicator: string;
  z: number;
  /** Percentile implied by the z-score, for readers who think in centiles. */
  percentile: number;
  /** The reference median at this age/length, for context. */
  median: number;
  classification: string;
  /** True when the tail adjustment above was applied. */
  tailAdjusted: boolean;
}

/**
 * Score one measurement against a standard.
 *
 * Returns null when the chart does not cover this child rather than
 * extrapolating — see `lmsAt`.
 */
export function scoreGrowth(table: LmsTable, x: number, value: number): ZScoreResult | null {
  const p = lmsAt(table, x);
  if (!p) return null;
  const adjust = usesWhoTailAdjustment(table.indicator);
  const raw = lmsZ(value, p);
  const z = adjust ? whoAdjustedZ(value, p) : raw;
  if (!Number.isFinite(z)) return null;
  return {
    indicator: table.indicator,
    z: round(z, 2),
    percentile: round(normalCdf(z) * 100, 1),
    median: round(p.m, 2),
    classification: classify(table.indicator, z),
    tailAdjusted: adjust && Math.abs(raw) > 3,
  };
}

/**
 * WHO classification for a z-score.
 *
 * Wording follows the thresholds already written into
 * `growth-development.json` so a computed result and the narrative record a
 * clinician reads beside it cannot disagree.
 */
export function classify(indicator: string, z: number): string {
  switch (indicator.toLowerCase()) {
    case 'wfa':
      if (z < -3) return 'Severely underweight (WAZ < -3 SD)';
      if (z < -2) return 'Underweight (WAZ < -2 SD)';
      if (z > 2) return 'High weight-for-age — interpret with weight-for-length and BMI-for-age';
      return 'Weight-for-age within the reference range';
    case 'wfl':
    case 'wfh':
      if (z < -3)
        return 'Severe acute malnutrition (WHZ < -3 SD) — assess for oedema and admit per IMAM';
      if (z < -2) return 'Moderate acute malnutrition (WHZ < -2 SD)';
      if (z > 3) return 'Obese (WHZ > +3 SD)';
      if (z > 2) return 'Overweight (WHZ > +2 SD)';
      return 'Weight-for-length/height within the reference range';
    case 'lhfa':
    case 'hfa':
      if (z < -3) return 'Severely stunted (HAZ < -3 SD)';
      if (z < -2) return 'Stunted (HAZ < -2 SD)';
      return 'Length/height-for-age within the reference range';
    case 'bfa':
      if (z < -3) return 'Severely wasted (BAZ < -3 SD)';
      if (z < -2) return 'Wasted (BAZ < -2 SD)';
      if (z > 3) return 'Obese (BAZ > +3 SD)';
      if (z > 2) return 'Overweight (BAZ > +2 SD)';
      return 'BMI-for-age within the reference range';
    default:
      if (z < -2 || z > 2) return 'Outside ±2 SD of the reference median';
      return 'Within ±2 SD of the reference median';
  }
}

/** Φ(z) via the Abramowitz & Stegun 7.1.26 error-function approximation. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
