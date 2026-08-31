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

export function extractCards(
  llmText: string,
  generatedAt: string,
  minConfidence: number = DEFAULT_AGENTIC_CONFIDENCE_FLOOR,
  resolveStrength?: CitationStrengthResolver,
): { cards: CdsCard[]; citedRecords: Array<{ kind: string; id: string }> } {
  const json = extractJsonObject(llmText);
  if (!json) return { cards: [], citedRecords: [] };

  const rawCards = Array.isArray((json as { cards?: unknown }).cards)
    ? (json as { cards: RawCard[] }).cards
    : [];

  const citedRecords: Array<{ kind: string; id: string }> = [];
  const cards: CdsCard[] = [];

  for (const rc of rawCards) {
    const summary = typeof rc.summary === 'string' ? rc.summary.trim() : '';
    const indicator = VALID_INDICATORS.includes(rc.indicator as CdsIndicator)
      ? (rc.indicator as CdsIndicator)
      : 'info';
    const detail = typeof rc.detail === 'string' ? rc.detail.trim() : undefined;
    const citations = parseCitations(rc.citations, resolveStrength);
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
    if (!summary) continue;
    if (citations.length === 0) continue;
    // Confidence floor — drop low-confidence cards (alert-fatigue control).
    if (confidence < minConfidence) continue;

    for (const cit of citations) citedRecords.push({ kind: cit.kind, id: cit.id });

    const card: CdsCard = {
      summary: summary.slice(0, 140),
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
          // Agentic cards always carry 'review' status — they're LLM
          // synthesis over reviewed bundle records, but the synthesis
          // itself is not human-reviewed. The UI surfaces this with a
          // dedicated "AI-assisted" badge so clinicians can calibrate
          // trust (HIGH-4 in the anti-hallucination audit).
          reviewStatus: 'review',
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
  return { cards: cards.slice(0, 6), citedRecords };
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
    const type = VALID_ACTION_TYPES.has(ao.type as string) ? (ao.type as string) : 'monitor';
    const description = typeof ao.description === 'string' ? ao.description.trim() : '';
    if (description) actions.push({ type, description });
  }
  if (actions.length === 0) return [];
  return [{ label, uuid: randomUuid(), actions }];
}

function randomUuid(): string {
  // Stable enough for a per-card identifier; not security-sensitive.
  return 'sg-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Parse + clamp the LLM-reported confidence to [0,1]; default 0.5 if absent/invalid. */
function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
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
): AgenticCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: AgenticCitation[] = [];
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
    out.push({
      kind: validKind,
      id,
      label: typeof obj.label === 'string' ? obj.label : id,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      strength: resolveStrength?.(validKind, id),
    });
  }
  return out;
}

/**
 * Extract the first balanced JSON object from arbitrary LLM text.
 * Handles code fences, leading prose, and trailing content.
 */
function extractJsonObject(text: string): unknown {
  if (!text) return null;
  // Strip markdown code fences.
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
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
