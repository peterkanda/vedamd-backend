/**
 * Agentic CDS — type definitions.
 *
 * VedaMD's agentic layer sits ON TOP of the deterministic strategies
 * (DDI check, AWaRe stewardship, pregnancy safety, paediatric dosing,
 * etc.). The deterministic layer always fires for safety-critical
 * checks; the agentic layer adds open-ended clinical reasoning over
 * the full 974-record signed bundle.
 *
 * Architectural rule: NOTHING from the inbound clinical context is
 * logged, cached, queued or persisted. The agentic engine treats
 * the request as in-memory only and discards on response (FR-088).
 */

import type { CdsCard, VedaMdRecommendationMeta } from '../cds/cds.types';

/**
 * Inbound clinical context to the agentic engine. Either a free-form
 * structured object (developer-supplied) or a FHIR Bundle (parsed by
 * the FHIR adapter) — both reduce to this shape before being passed
 * to the LLM provider.
 */
export type AgenticMode = 'deterministic' | 'agentic' | 'auto';

export interface AgenticClinicalContext {
  /** Caller-supplied hook label (e.g. "medication-prescribe", "patient-view", "discharge-summary"). */
  hook?: string;
  /**
   * Evaluation mode:
   *   'deterministic' — safety floor only (free, fast, no LLM call).
   *   'agentic'       — force LLM reasoning (errors if no provider configured).
   *   'auto'          — agentic when a provider is configured, else deterministic. (default)
   */
  mode?: AgenticMode;
  /**
   * Minimum confidence (0-1) for an agentic card to be returned. Cards
   * below this are dropped — lets apps tune signal/noise + reduce alert
   * fatigue. Deterministic cards are never filtered. Default 0.
   */
  minConfidence?: number;
  /** Caller-supplied free-text reason / question to evaluate (optional). */
  question?: string;
  /** Anonymous patient signals — age, sex, weight, key labs, comorbidities. */
  patient?: {
    ageYears?: number;
    ageMonths?: number;
    weightKg?: number;
    sex?: 'male' | 'female' | 'other';
    pregnant?: boolean;
    gestationWeeks?: number;
    eGFR?: number;
    creatinineUmolL?: number;
    weight_class?: string;
  };
  /** Proposed / current medications (slugs or free-text — the engine fuzzy-matches against the bundle). */
  medications?: string[];
  /** Known diagnoses / conditions (slugs or free-text). */
  diagnoses?: string[];
  /** Active allergies (drug + non-drug). */
  allergies?: string[];
  /** Recent lab results (LOINC-coded where possible). */
  labs?: Array<{
    code?: string;
    name?: string;
    value: number | string;
    unit?: string;
    date?: string;
  }>;
  /** Open-ended structured signals — vitals, scores, flags. */
  signals?: Record<string, unknown>;
  /**
   * Internal: integrator id forwarded by the controller. Lets the
   * engine retrieve the calling integrator's uploaded policies /
   * standards so its recommendations can be checked against — and
   * cited to — them. Never echoed in logs.
   */
  integratorId?: string;
}

/**
 * Agentic-engine evaluation response. Compatible with CDS Hooks 1.0
 * (cards array). Adds a reasoning trail + provenance for developer
 * transparency.
 */
export interface AgenticEvaluationResponse {
  /** CDS Hooks-compatible cards (deterministic + agentic, merged). */
  cards: CdsCard[];
  /** Provenance metadata. */
  meta: {
    /** Which deterministic strategies fired. */
    deterministicStrategies: string[];
    /** Number of integrator-defined custom CDS rules that fired. */
    customRuleCount?: number;
    /** LLM model used by the agentic layer (if any). */
    llmModel?: string;
    /** LLM provider used. */
    llmProvider?: 'anthropic' | 'openai' | 'disabled';
    /** Whether the agentic layer ran (false if API keys not configured). */
    agenticInvoked: boolean;
    /** Total bundle records considered. */
    bundleRecordsConsidered: number;
    /** Bundle records cited in the LLM reasoning. */
    citedRecords: Array<{ kind: string; id: string }>;
    /** Time spent in agentic reasoning (ms). */
    agenticLatencyMs: number;
    /**
     * Per-integrator policy / standards sections matched to the query
     * and passed to the agentic prompt. Surfaced so the UI can show
     * "Per [policy] §[section]" provenance alongside each card.
     */
    policyCitations?: Array<{
      policyId: string;
      name: string;
      source: string;
      version?: string;
      sectionTitle?: string;
      snippet: string;
    }>;
    /** Custom CDS rules that fired (provenance for the UI). */
    customRuleCitations?: Array<{
      ruleId: string;
      ruleName: string;
      indicator: 'critical' | 'warning' | 'info';
    }>;
  };
}

/**
 * Population / retrospective batch evaluation response. One result per
 * submitted item (preserving order + caller id), plus a roll-up
 * summary so the caller can triage the most dangerous patients first.
 */
export interface AgenticBatchResponse {
  results: Array<
    | { id?: string; ok: true; evaluation: AgenticEvaluationResponse }
    | { id?: string; ok: false; error: string }
  >;
  summary: {
    /** Items successfully evaluated. */
    evaluated: number;
    /** Items that errored (isolated; did not fail the batch). */
    errored: number;
    /** Total critical cards across the batch. */
    critical: number;
    /** Total warning cards. */
    warning: number;
    /** Total info cards. */
    info: number;
  };
  batchLatencyMs: number;
}

/**
 * Structured citation a card may carry. References a record in the
 * signed bundle so the integrator can show provenance to the
 * clinician.
 */
export interface AgenticCitation {
  /** Record domain: 'drug', 'ddi', 'condition', 'procedure', 'rule'. */
  kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule';
  /** Bundle identifier (slug or composite). */
  id: string;
  /** Human label. */
  label: string;
  /** Optional external link. */
  url?: string;
}

/**
 * Retrieved knowledge — passed into the LLM prompt as ground truth.
 * The retriever picks records relevant to the inbound context.
 */
export interface RetrievedKnowledge {
  drugs: Array<{ slug: string; inn: string; summary: string }>;
  interactions: Array<{ slugA: string; slugB: string; severity: string; mechanism: string; management: string }>;
  conditions: Array<{ slug: string; title: string; summary: string }>;
  procedures: Array<{ slug: string; title: string; summary: string }>;
  rules: Array<{ id: string; title: string; description: string }>;
}

/**
 * Card emitted by the agentic engine — has the same shape as a
 * deterministic CDS card but carries reasoning + citations.
 */
export interface AgenticCard extends CdsCard {
  /** Internal — extracted from LLM structured output, becomes detail field. */
  reasoning?: string;
  /** Records the LLM cited. */
  citations?: AgenticCitation[];
}
