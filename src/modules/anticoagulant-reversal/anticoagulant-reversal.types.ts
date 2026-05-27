import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Anticoagulant reversal reference. A bleeding patient on warfarin / a
 * DOAC / heparin can die in minutes; the clinician needs the reversal
 * agent, dose, and indication at the elbow — not buried in a chapter.
 *
 * Anonymous by design: every record is reference-only and never touches
 * patient identity. Each record links (where applicable) to the
 * anticoagulant drug slug and the reversal-agent drug slug, so an
 * integrator can chain "recognise on-drug bleed → reverse" inside their
 * EMR.
 */
export type ReversalUrgency =
  | 'life-threatening-bleed'
  | 'urgent-surgery-or-procedure'
  | 'major-non-life-threatening-bleed'
  | 'minor-bleed-or-supratherapeutic-no-bleed';

export interface ReversalProtocol {
  /** Clinical scenario this protocol applies to. */
  urgency: ReversalUrgency;
  /** Specific reversal agent (or 'supportive only' / 'hold drug'). */
  agent: string;
  /** Slug of the reversal-agent drug record, when one exists. */
  agentDrugSlug?: string | null;
  /** Dosing string — verbatim from the cited guideline; do not paraphrase. */
  dosing: string;
  /** Adjuncts: vitamin K, IV fluid, blood products, supportive measures. */
  adjuncts?: string[];
  /** What to monitor after reversal (INR, anti-Xa, ECT, dilute thrombin time, clinical bleeding). */
  monitoring?: string;
  /** Things to avoid in this scenario (e.g. avoid FFP in DOAC bleed when PCC available). */
  cautions?: string[];
}

export interface AnticoagulantReversalSummary {
  slug: string;
  /** Anticoagulant name (e.g. "Warfarin", "Apixaban"). */
  anticoagulant: string;
  /** Slug of the anticoagulant's drug record, when one exists. */
  anticoagulantDrugSlug?: string | null;
  /** Drug class: VKA / DOAC-Xa / DOAC-IIa / heparin / LMWH / fondaparinux / fibrinolytic. */
  drugClass: string;
  /** One-line summary: "Reverse with 4F-PCC for life-threatening bleed; vitamin K for INR > 10 without bleed." */
  oneLiner: string;
  domains: string[];
}

export interface AnticoagulantReversal extends AnticoagulantReversalSummary, ContentReviewMetadata {
  /** Mechanism of the anticoagulant — short, so the clinician understands why a given reversal works. */
  mechanism: string;
  /** Protocols ordered by urgency severity (life-threatening first). */
  protocols: ReversalProtocol[];
  /** Common pitfalls: half-life-driven decisions, time since last dose, renal clearance. */
  pitfalls: string[];
  references: { label: string; url?: string }[];
}
