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
  createdAt: string;
}
