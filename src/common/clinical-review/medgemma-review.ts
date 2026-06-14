import type { Citation } from '../citation';

/**
 * MedGemma content-validation core (pure, unit-testable).
 *
 * Uses a medically-tuned model (MedGemma) as an automated SECOND OPINION over
 * authored content — a screening substitute for a human clinician, NOT an
 * oracle. The model is asked to flag medical inaccuracies, with special
 * attention to drug choice and dosing, and to return a structured verdict.
 *
 * Treat the output as candidate issues to review: a `concern`/`error` verdict
 * is a flag, not a fact, and an `ok` verdict is reassurance, not approval. The
 * model is also told NOT to invent specific doses — our content deliberately
 * defers exact doses to weight-based charts, and the reviewer should respect
 * that rather than demand a number.
 */

export type ReviewVerdict = 'ok' | 'concern' | 'error' | 'unknown';

export interface ReviewResult {
  verdict: ReviewVerdict;
  /** True if the reviewer raised a drug-choice or dosing concern specifically. */
  dosingConcern: boolean;
  /** Short, specific issues the reviewer found (empty when ok). */
  issues: string[];
  /** Optional suggested correction (advisory only). */
  suggestion?: string;
  /** Reviewer's confidence in its own assessment, 0..1. */
  confidence: number;
}

export interface ReviewableRecord {
  slug?: string;
  title?: string;
  domain?: string;
  jurisdiction?: string;
  /** Compact, human-readable serialization of the record's clinical fields. */
  content: string;
  references?: Citation[];
}

export const MEDGEMMA_REVIEW_SYSTEM = `You are MedGemma, a careful medical reviewer auditing clinical decision-support content for a primary-care platform used in Kenya and Sub-Saharan Africa.

Review the supplied record for MEDICAL ACCURACY. Pay special attention to:
- drug CHOICE (is the stated first-line agent correct for the condition and setting?),
- DOSING safety (wrong dose, missing weight-banding, missing maximum, dangerous route),
- contraindications, red flags, and referral criteria that are wrong or missing,
- internal contradictions.

Rules:
- The content INTENTIONALLY omits specific mg/kg doses and defers them to national weight-based charts. Do NOT flag a missing specific dose as an error; only flag a dose that is actually STATED and wrong.
- Be conservative: if something is plausibly correct, do not flag it. Flag only genuine concerns.
- Do not invent doses or facts.

Respond with ONLY a JSON object, no prose, in this exact shape:
{"verdict":"ok|concern|error","dosingConcern":true|false,"issues":["..."],"suggestion":"...","confidence":0.0-1.0}
- "ok": no medical concern. "concern": possible issue worth a human check. "error": likely medical error.`;

/** Build the user message for a single record review. */
export function buildReviewPrompt(rec: ReviewableRecord): string {
  const meta = [
    rec.title ? `Title: ${rec.title}` : '',
    rec.domain ? `Domain: ${rec.domain}` : '',
    rec.jurisdiction ? `Jurisdiction: ${rec.jurisdiction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const cites = (rec.references ?? [])
    .map((r) => `- ${r.label}${r.url ? ` (${r.url})` : ''}`)
    .join('\n');
  return (
    `${meta}\n\nCONTENT TO REVIEW:\n${rec.content}\n\n` +
    (cites ? `CITED SOURCES:\n${cites}\n\n` : '') +
    `Audit the above. Respond with ONLY the JSON verdict.`
  );
}

const ALLOWED: ReviewVerdict[] = ['ok', 'concern', 'error', 'unknown'];

/**
 * Parse the model's response into a structured verdict. Robust to prose/code
 * fences around the JSON. Anything unparseable becomes a conservative 'unknown'
 * so it is surfaced for human review rather than silently passing.
 */
export function parseReviewVerdict(text: string): ReviewResult {
  const json = extractJsonObject(text);
  if (!json || typeof json !== 'object') {
    return { verdict: 'unknown', dosingConcern: false, issues: ['Unparseable reviewer response'], confidence: 0 };
  }
  const o = json as Record<string, unknown>;
  const verdict = ALLOWED.includes(o.verdict as ReviewVerdict) ? (o.verdict as ReviewVerdict) : 'unknown';
  const issues = Array.isArray(o.issues)
    ? o.issues.filter((i): i is string => typeof i === 'string').map((s) => s.slice(0, 300))
    : [];
  const confRaw = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
  const confidence = Number.isNaN(confRaw) ? 0 : Math.max(0, Math.min(1, confRaw));
  return {
    verdict,
    dosingConcern: o.dosingConcern === true,
    issues,
    suggestion: typeof o.suggestion === 'string' && o.suggestion.trim() ? o.suggestion.trim().slice(0, 500) : undefined,
    confidence,
  };
}

/** True when a verdict warrants human attention (flag for review). */
export function isFlagged(r: ReviewResult): boolean {
  return r.verdict === 'error' || r.verdict === 'concern' || r.verdict === 'unknown' || r.dosingConcern;
}

/** Extract the first balanced JSON object from arbitrary model text. */
function extractJsonObject(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
