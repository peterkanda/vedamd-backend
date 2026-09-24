import type { CdsCard, CdsIndicator } from '../cds/cds.types';
import type { AgenticCitation } from './agentic.types';

/**
 * Parses + validates the LLM's structured JSON output into safe
 * CDS Hooks cards. Defensive: the LLM may wrap JSON in prose / code
 * fences / partial output. We extract the JSON object, validate each
 * card, drop invalid ones, and enforce the citation requirement
 * (every agentic card must cite a bundle record).
 */

interface RawCard {
  summary?: unknown;
  indicator?: unknown;
  detail?: unknown;
  confidence?: unknown;
  citations?: unknown;
  suggestion?: unknown;
}

const VALID_ACTION_TYPES = new Set(['remove', 'modify', 'add', 'monitor', 'order-test']);

const VALID_INDICATORS: CdsIndicator[] = ['info', 'warning', 'critical'];
const INDICATOR_RANK: Record<CdsIndicator, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Anti-hallucination confidence floor applied to LLM-generated cards
 * when the caller does not specify one. Cards below this threshold
 * are silently dropped: the agentic layer is meant to *amplify* the
 * deterministic safety floor, not replace it with low-confidence
 * synthesis. The number is conservative — a 0.5 confidence card is
 * a coin flip and not safe to show clinicians as actionable advice.
 */
const DEFAULT_AGENTIC_CONFIDENCE_FLOOR = 0.6;

/**
 * Optional resolver that returns the source-strength tier for a cited
 * bundle record. The agentic service supplies one backed by the loaded
 * KnowledgeService; tests pass a stub or omit it. When omitted citations
 * still flow but without strength badges in the UI.
 */
export type CitationStrengthResolver = (
  kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
  id: string,
) => 'A' | 'B' | 'C' | 'D' | undefined;

/**
 * Optional check that a cited record was actually among the knowledge retrieved
 * for THIS request.
 *
 * Without it the citation guard only proves the model emitted *a string*. A
 * fabricated slug passed every check and was then displayed as its own label —
 * and because `evidenceCeiling()` declines to cap confidence when no strength
 * resolves, an invented citation also escaped the evidence cap, which is
 * exactly the case it exists for. Supplying this closes both holes at once:
 * unknown citations are dropped, and a card left with none fails the existing
 * citation requirement.
 *
 * Optional on purpose — when no verifier is wired (unit tests, deployments
 * without the knowledge service) behaviour is unchanged.
 */
export type CitationVerifier = (
  kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
  id: string,
) => boolean;

/** Looks up what a verified citation names in the bundle. */
export type CitationDescriber = (
  kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
  id: string,
) => { label: string; reviewStatus?: string } | undefined;

export interface ExtractedCards {
  cards: CdsCard[];
  citedRecords: Array<{ kind: string; id: string }>;
  /** Cards the model proposed that failed a check and were withheld. */
  rejected: number;
  /** The output looked like a card block but could not be parsed. */
  unparseable: boolean;
}

export function extractCards(
  llmText: string,
  generatedAt: string,
  minConfidence: number = DEFAULT_AGENTIC_CONFIDENCE_FLOOR,
  resolveStrength?: CitationStrengthResolver,
  verifyCitation?: CitationVerifier,
  describeCitation?: CitationDescriber,
): ExtractedCards {
  const json = extractJsonObject(llmText);
  if (!json) {
    return {
      cards: [],
      citedRecords: [],
      rejected: 0,
      unparseable: /"cards"\s*:/.test(llmText ?? ''),
    };
  }

  const rawCards = Array.isArray((json as { cards?: unknown }).cards)
    ? (json as { cards: RawCard[] }).cards
    : [];

  const cards: CdsCard[] = [];
  let rejected = 0;

  for (const rc of rawCards) {
    const fullSummary = typeof rc.summary === 'string' ? rc.summary.trim() : '';
    const indicator = parseIndicator(rc.indicator);
    const citations = parseCitations(
      rc.citations,
      resolveStrength,
      verifyCitation,
      describeCitation,
    );
    // Evidence-grounded confidence: the LLM's self-reported number is capped by
    // what the cited sources actually support (source-strength tier), so the
    // displayed score reflects EVIDENCE, not just the model's opinion. Taking
    // the min is conservative — we never show more confidence than either the
    // model OR its evidence justifies. When no strength signal is available
    // (resolver not wired), evidence does not cap (defers to the model).
    const selfReported = clampConfidence(rc.confidence);
    const confidence = Math.min(selfReported, evidenceCeiling(citations));
    const suggestions = parseSuggestion(rc.suggestion);

    // Invalid card guards: must have a summary AND at least one citation.
    // Confidence floor — drop low-confidence cards (alert-fatigue control).
    if (!fullSummary || citations.length === 0 || confidence < minConfidence) {
      rejected += 1;
      continue;
    }

    // CDS Hooks caps the summary at 140 characters. Cut at a word boundary
    // and keep the whole sentence in the detail: a bare slice could end
    // mid-dose ("give 7.5 mg/kg of genta").
    const summary = shortSummary(fullSummary);
    const rawDetail = typeof rc.detail === 'string' ? rc.detail.trim() : undefined;
    const detail =
      summary === fullSummary ? rawDetail : [fullSummary, rawDetail].filter(Boolean).join('\n\n');

    const card: CdsCard = {
      summary,
      indicator,
      detail,
      source: {
        label: 'VedaMD agentic clinical reasoning',
        url: 'https://vedamd.io/agentic',
      },
      ...(suggestions.length ? { suggestions } : {}),
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: 'agentic-reasoner',
          ruleVersion: '0.1.0',
          evidenceLevel: 'expert-consensus',
          // LLM synthesis is never better reviewed than the least-reviewed
          // record it cites. A hard-coded 'review' hid that every record in
          // today's bundle is still a draft.
          reviewStatus: leastReviewed(citations.map((c) => c.reviewStatus)),
          generatedAt,
          codings: citations.map((cit) => ({
            system: 'http://vedamd.io/codesystem/bundle-record',
            code: `${cit.kind}:${cit.id}`,
            display: cit.label,
            kind: 'other' as const,
          })),
        },
        'http://vedamd.io/Card/agentic-confidence': confidence,
        // Surface the full citations including source-strength tier so
        // the frontend can render the A/B/C/D badge next to each one.
        // Trust calibration is a primary clinical-safety feature: a
        // critical-severity card backed only by D-tier sources should
        // be visibly weaker than one backed by KDIGO + NEJM (A-tier).
        'http://vedamd.io/Card/citations': citations,
      },
    };
    cards.push(card);
  }

  cards.sort((a, b) => INDICATOR_RANK[a.indicator] - INDICATOR_RANK[b.indicator]);
  const kept = cards.slice(0, 6);
  // Audit only what was returned (this used to list the citations of cards
  // cut by the six-card limit too).
  const citedRecords = kept.flatMap(
    (c) =>
      c.extension?.['http://vedamd.io/Card/citations']?.map((cit) => ({
        kind: cit.kind,
        id: cit.id,
      })) ?? [],
  );
  return { cards: kept, citedRecords, rejected, unparseable: false };
}

const REVIEW_ORDER = ['deprecated', 'draft', 'review', 'approved'] as const;
type ReviewStatus = (typeof REVIEW_ORDER)[number];

function leastReviewed(statuses: Array<string | undefined>): ReviewStatus {
  const known = statuses.filter((s): s is ReviewStatus =>
    (REVIEW_ORDER as readonly string[]).includes(s ?? ''),
  );
  if (known.length === 0) return 'draft';
  return known.reduce((a, b) => (REVIEW_ORDER.indexOf(a) <= REVIEW_ORDER.indexOf(b) ? a : b));
}

function shortSummary(s: string): string {
  if (s.length <= 140) return s;
  const cut = s.slice(0, 139);
  const space = cut.lastIndexOf(' ');
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/**
 * Severity from the model. Matching was case-sensitive, so "Critical" became
 * info. Anything unrecognised is a warning: an unreadable severity must not
 * become the quietest one.
 */
function parseIndicator(raw: unknown): CdsIndicator {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (VALID_INDICATORS.includes(v as CdsIndicator)) return v as CdsIndicator;
  if (/^(urgent|emergency|severe|high|danger|red)$/.test(v)) return 'critical';
  if (/^(low|information|informational|note)$/.test(v)) return 'info';
  return 'warning';
}

/**
 * Parse the LLM's optional suggestion into a CDS Hooks `suggestions`
 * array. VedaMD keeps suggestions content-driven (not FHIR-coupled):
 * a label + human-readable proposed actions the EMR turns into a real
 * order. Invalid / empty suggestions are dropped.
 */
function parseSuggestion(raw: unknown): Array<{
  label: string;
  uuid: string;
  actions: Array<{ type: string; description: string }>;
}> {
  if (typeof raw !== 'object' || raw === null) return [];
  const obj = raw as Record<string, unknown>;
  const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, 80) : '';
  if (!label) return [];
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: Array<{ type: string; description: string }> = [];
  for (const a of rawActions) {
    if (typeof a !== 'object' || a === null) continue;
    const ao = a as Record<string, unknown>;
    const type = parseActionType(ao.type);
    const description = typeof ao.description === 'string' ? ao.description.trim() : '';
    // An unknown action type is dropped, not relabelled: "stop warfarin"
    // used to arrive as a "monitor" action.
    if (type && description) actions.push({ type, description });
  }
  if (actions.length === 0) return [];
  return [{ label, uuid: randomUuid(), actions }];
}

const ACTION_SYNONYMS: Array<[RegExp, string]> = [
  [/^(stop|discontinue|hold|withhold|avoid|cease|cancel|remove|deprescribe)$/, 'remove'],
  [/^(change|adjust|reduce|increase|decrease|switch|titrate|modify|substitute)$/, 'modify'],
  [/^(start|begin|initiate|prescribe|give|add|administer)$/, 'add'],
  [/^(order|test|check|investigate|order-test|measure)$/, 'order-test'],
  [/^(monitor|observe|watch|review|follow-up|recheck)$/, 'monitor'],
];

function parseActionType(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (VALID_ACTION_TYPES.has(v)) return v;
  return ACTION_SYNONYMS.find(([re]) => re.test(v))?.[1] ?? null;
}

function randomUuid(): string {
  // Stable enough for a per-card identifier; not security-sensitive.
  return 'sg-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * The model's self-reported confidence, in [0,1]. A percentage (85) is read
 * as 0.85 rather than clamped to certainty; anything missing or unreadable is
 * 0 — below any floor — rather than a middling 0.5.
 */
function clampConfidence(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim().replace(/%$/, ''))
        : NaN;
  if (!Number.isFinite(n)) return 0;
  // 5–100 is a percentage; a slightly-over-1 value (1.7) is an over-eager
  // probability and clamps to 1.
  const v = n >= 5 && n <= 100 ? n / 100 : n;
  return Math.max(0, Math.min(1, v));
}

/**
 * Confidence ceiling implied by the strength of the cited evidence. A card can
 * be no more trustworthy than its best supporting source: A-tier (international
 * guideline / regulator / Cochrane / top journal) supports high confidence;
 * D-tier (consumer/wiki) caps it low. Returns 1 (no cap) when NO citation has a
 * resolved strength — we only down-weight when we actually have a signal, so
 * environments without the strength resolver behave as before.
 */
const STRENGTH_CEILING: Record<'A' | 'B' | 'C' | 'D', number> = {
  A: 0.95,
  B: 0.85,
  C: 0.7,
  D: 0.5,
};

function evidenceCeiling(citations: AgenticCitation[]): number {
  const tiers = citations
    .map((c) => c.strength)
    .filter((s): s is 'A' | 'B' | 'C' | 'D' => s === 'A' || s === 'B' || s === 'C' || s === 'D');
  if (tiers.length === 0) return 1;
  return Math.max(...tiers.map((t) => STRENGTH_CEILING[t]));
}

function parseCitations(
  raw: unknown,
  resolveStrength?: CitationStrengthResolver,
  verifyCitation?: CitationVerifier,
  describeCitation?: CitationDescriber,
): Array<AgenticCitation & { reviewStatus?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<AgenticCitation & { reviewStatus?: string }> = [];
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue;
    const obj = c as Record<string, unknown>;
    const kind = obj.kind;
    const id = obj.id;
    if (typeof id !== 'string' || !id) continue;
    const validKind =
      kind === 'drug' ||
      kind === 'ddi' ||
      kind === 'condition' ||
      kind === 'procedure' ||
      kind === 'rule'
        ? kind
        : 'rule';
    // A citation naming a record we didn't retrieve is unverifiable; drop it
    // rather than render the invented id back to the clinician as its own label.
    if (verifyCitation && !verifyCitation(validKind, id)) continue;
    // The label and link come from the bundle, never the model: the id was
    // verified, but a model-written label or URL could attach an invented
    // guideline name to a real record.
    const described = describeCitation?.(validKind, id);
    out.push({
      kind: validKind,
      id,
      label: described?.label ?? id,
      strength: resolveStrength?.(validKind, id),
      reviewStatus: described?.reviewStatus,
    });
  }
  return out;
}

/**
 * Extract the first balanced JSON object from arbitrary LLM text.
 * Handles code fences, leading prose, and trailing content.
 */
/**
 * Every balanced top-level {…} or […] span in `text` (string-aware), as
 * [start, end) offsets. Shared by card extraction and the narrative stripper.
 */
export function findJsonSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (depth > 0) {
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
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if ((ch === '}' || ch === ']') && depth > 0) {
      depth--;
      if (depth === 0) spans.push([start, i + 1]);
    }
  }
  return spans;
}

function extractJsonObject(text: string): unknown {
  if (!text) return null;
  // A fenced block wins; otherwise try each balanced span in turn, so a stray
  // "{" in the prose before the JSON no longer sinks the whole answer.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const sources = fenced ? [fenced[1], text] : [text];
  let fallback: unknown = null;
  for (const src of sources) {
    for (const [a, b] of findJsonSpans(src)) {
      if (src[a] !== '{') continue;
      try {
        const parsed = JSON.parse(src.slice(a, b)) as unknown;
        if (Array.isArray((parsed as { cards?: unknown })?.cards)) return parsed;
        fallback ??= parsed;
      } catch {
        /* not JSON — keep looking */
      }
    }
  }
  return fallback;
}
