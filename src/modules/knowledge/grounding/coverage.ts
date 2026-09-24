import { candidateTerms } from './terms';
import type { BundleTermStats } from './term-stats';

/** Safety topics a question can turn on, each answerable only from a field. */
export type Topic =
  | 'pregnancy'
  | 'lactation'
  | 'renal'
  | 'hepatic'
  | 'interaction'
  | 'dose'
  | 'contraindication';

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  pregnancy: /pregnan|mjamzito|ujauzito|antenatal|trimester/i,
  lactation: /breast ?feed|lactat|nursing|kunyonyesha/i,
  renal: /\b(renal|kidney|ckd|egfr|crcl|creatinine clearance|dialysis)/i,
  hepatic: /\b(hepatic|liver|cirrho)/i,
  interaction: /interact|\bcombine\b|\bcombining\b|\btogether with\b/i,
  // "Regimen" is left out: "first-line ART regimen" asks which drugs, and is
  // answered by a rule's description rather than a dosing field.
  dose: /\bdos(e|es|ing|age)|\bhow (much|many)\b|\d\s*(mg|mcg|kg|ml)\b|\bmg\b|kipimo|dozi|titrat/i,
  contraindication: /contraindicat/i,
};

/**
 * Record keys that can answer each topic. Grounding summaries are JSON, so a
 * topic counts as placed when one of these keys appears in the placed text.
 */
export const TOPIC_KEYS: Record<Topic, string[]> = {
  pregnancy: ['pregnancy', 'pregnancyCompatibility'],
  lactation: ['lactation', 'lactationCompatibility'],
  renal: ['renal', 'akiGuidance', 'dialysisDoseGuidance'],
  hepatic: ['hepatic', 'worstClassDecision', 'acuteFailureGuidance'],
  interaction: ['mechanism', 'severity'],
  dose: [
    'dosing',
    'doses',
    'dose',
    'regimen',
    'management',
    'adult',
    'paediatric',
    'protocols',
    'recommendation',
  ],
  contraindication: ['contraindications', 'warnings', 'recommendation'],
};

export function questionTopics(question: string): Set<Topic> {
  const out = new Set<Topic>();
  for (const [topic, re] of Object.entries(TOPIC_PATTERNS) as [Topic, RegExp][]) {
    if (re.test(question)) out.add(topic);
  }
  return out;
}

/** A record as it was actually placed in the prompt. */
export interface PlacedRecord {
  record: Record<string, unknown>;
  /** The grounding text the model saw for this record. */
  text: string;
}

export interface GroundingAssessment {
  grounded: boolean;
  /** Share (by specificity weight) of the question's named terms covered. */
  coverage: number;
  /** The most specific term — what the question is about. */
  head?: string;
  uncovered: string[];
  /** Topics asked about that no placed record naming `head` carries. */
  missingTopics: Topic[];
}

/** A term appearing in this share of records or more is background. */
const BACKGROUND_SHARE = 0.1;
/** Coverage needed to call an answer grounded (mirrors the mobile app). */
export const GROUNDED_MIN_COVERAGE = 0.6;

/**
 * The words that say what a question is about, most specific kept. Empty for
 * a bare follow-up ("and for a 2 year old?"), which has to be read together
 * with the previous question.
 */
export function subjectTerms(question: string, stats: BundleTermStats): string[] {
  const n = Math.max(1, stats.total);
  const df = (t: string) => stats.docFreq(t);
  const candidates = candidateTerms(question).filter(
    // two-letter tokens ("tb") only when they name something in the bundle
    (t) => t.length >= 3 || stats.isName(t),
  );
  const nonBackground = candidates.filter((t) => df(t) / n < BACKGROUND_SHARE);
  const pool = nonBackground.length > 0 ? nonBackground : candidates;
  const kept = pool.filter((t) => df(t) > 0 || (/^[a-z]+$/.test(t) && t.length >= 5));
  const named = kept.filter((t) => stats.isName(t) || df(t) === 0 || (df(t) <= 3 && t.length >= 5));
  return named.length > 0 ? named : kept;
}

/**
 * Does the content placed in the prompt actually cover this question?
 *
 * "Something was retrieved" is not enough: a single common clinical word
 * ("pregnancy") used to ground a question about a drug the bundle has never
 * heard of, labelling a memory answer as VedaMD content. So:
 *  - background words (in ≥ 10 % of records) are ignored;
 *  - an unknown word of 5+ letters is kept at full weight — it is almost
 *    always the drug or disease being asked about, and it must be covered;
 *  - the most specific term (the head) must be covered;
 *  - when the question turns on a safety topic (pregnancy, renal, dose …), a
 *    placed record naming the head must carry that field. "Zolmitriptan in
 *    pregnancy" is not answered by a migraine record that mentions
 *    zolmitriptan but says nothing about pregnancy.
 */
export function assessGrounding(
  question: string,
  placed: PlacedRecord[],
  stats: BundleTermStats,
): GroundingAssessment {
  const n = Math.max(1, stats.total);
  const df = (t: string) => stats.docFreq(t);
  const terms = subjectTerms(question, stats);
  const topics = [...questionTopics(question)];

  if (terms.length === 0 || placed.length === 0) {
    return { grounded: false, coverage: 0, uncovered: terms, missingTopics: topics };
  }

  const weight = (t: string) => Math.log(1 + n / (1 + df(t)));
  const covers = (p: PlacedRecord, t: string) => stats.tokensOf(p.record).has(t);
  const covered = (t: string) => placed.some((p) => covers(p, t));

  let total = 0;
  let hit = 0;
  for (const t of terms) {
    total += weight(t);
    if (covered(t)) hit += weight(t);
  }
  const coverage = total > 0 ? hit / total : 0;
  const head = [...terms].sort((a, b) => weight(b) - weight(a))[0];

  const headRecords = placed.filter((p) => covers(p, head));
  const missingTopics = topics.filter(
    (topic) =>
      !headRecords.some((p) =>
        TOPIC_KEYS[topic].some((k) => new RegExp(`"${k}"\\s*:`).test(p.text)),
      ),
  );

  return {
    grounded:
      coverage >= GROUNDED_MIN_COVERAGE && headRecords.length > 0 && missingTopics.length === 0,
    coverage,
    head,
    uncovered: terms.filter((t) => !covered(t)),
    missingTopics,
  };
}
