/**
 * CDS Hooks 1.0 §6 — Feedback envelope.
 * https://cds-hooks.org/specification/current/#feedback
 *
 * Spec lets the EHR report what the clinician did with each card so the
 * publisher can measure alert fatigue + tune false-positive rules.
 */

export type CdsFeedbackOutcome = 'accepted' | 'overridden';

export interface CdsOverrideReason {
  /** Coded reason from a closed list the EMR exposes. */
  reason?: { code: string; system?: string; display?: string };
  /** Optional free-text comment from the clinician. */
  userComment?: string;
}

export interface CdsFeedbackEntry {
  /** UUID of the card we returned in the original /cds-services response. */
  card: string;
  outcome: CdsFeedbackOutcome;
  /** ISO-8601 timestamp the clinician took the action. */
  outcomeTimestamp?: string;
  /** Required when outcome === "accepted" and the card had suggestions. */
  acceptedSuggestions?: Array<{ id: string }>;
  /** Required when outcome === "overridden". */
  overrideReason?: CdsOverrideReason;
  /**
   * VedaMD extension (not in CDS Hooks 1.0): why the clinician accepted.
   * Our UI requires it for critical LLM cards, because clinicians adopt
   * harmful AI advice far more readily than beneficial advice. Spec-only
   * clients can omit it.
   */
  acceptReason?: CdsOverrideReason;
}

export interface CdsFeedbackRequest {
  feedback: CdsFeedbackEntry[];
}

/** PHI-free summary row used by the dashboard endpoint. */
export interface CdsFeedbackRuleSummary {
  ruleId: string | null;
  /** First service id observed for this rule (rule could fan out across services). */
  firstServiceId: string;
  hook: string;
  totalFeedback: number;
  accepted: number;
  overridden: number;
  /** overridden / totalFeedback × 100; 0 when totalFeedback === 0. */
  overrideRatePct: number;
  /** Top 3 override reason codes seen, in descending frequency. */
  topOverrideReasons: Array<{ code: string; display?: string; count: number }>;
  lastFeedbackAt: string;
}

export interface CdsFeedbackPagedRow {
  id: string;
  cardUuid: string;
  ruleId: string | null;
  serviceId: string;
  hook: string;
  outcome: CdsFeedbackOutcome;
  overrideReasonCode: string | null;
  overrideReasonDisplay: string | null;
  userComment: string | null;
  modelId: string | null;
  indicator: string | null;
  acceptReasonCode: string | null;
  acceptReasonDisplay: string | null;
  createdAt: string;
}

/** Adoption of LLM-generated cards for one model. PHI-free. */
export interface CdsFeedbackModelSummary {
  /** Model id as reported by the provider; "unknown" when it wasn't captured. */
  modelId: string;
  totalFeedback: number;
  accepted: number;
  overridden: number;
  overrideRatePct: number;
  /** Feedback on critical cards — the ones where blind adoption does the most harm. */
  criticalFeedback: number;
  criticalAccepted: number;
  /** Critical cards accepted with no reason given (spec-only clients, or a bypassed UI). */
  criticalAcceptedWithoutReason: number;
  topOverrideReasons: Array<{ code: string; display?: string; count: number }>;
  topAcceptReasons: Array<{ code: string; display?: string; count: number }>;
  firstFeedbackAt: string;
  lastFeedbackAt: string;
  /** True once the model has enough feedback for its rates to be worth comparing. */
  sufficientData: boolean;
}

/**
 * How the newest model compares with the one before it. Answers "did the
 * model change shift how clinicians treat AI advice?" — the check to run
 * after every model bump.
 */
export interface CdsFeedbackModelComparison {
  currentModelId: string;
  previousModelId: string;
  /** current − previous, percentage points. */
  overrideRateDeltaPct: number;
  /** current − previous acceptance rate on critical cards, percentage points; null if either has none. */
  criticalAcceptRateDeltaPct: number | null;
  /** False until both models reach the minimum sample — deltas before then are noise. */
  comparable: boolean;
}

export interface CdsFeedbackModelReport {
  minSample: number;
  models: CdsFeedbackModelSummary[];
  comparison: CdsFeedbackModelComparison | null;
}
