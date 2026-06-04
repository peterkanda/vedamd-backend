import type { Citation } from '../../common/citation';
import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Hepatic dose adjustment reference. The existing drug records carry a
 * narrative `hepatic` field; this module is the structured-axis
 * counterpart — per Child-Pugh class guidance, the same way renal
 * adjustment is systematic. Without this, hepatic dose mistakes are
 * common: PMs in fulminant hepatic failure die from accumulated
 * benzodiazepines; cirrhotic patients on standard paracetamol develop
 * hepatotoxicity; DOACs in Child-Pugh C cause uncontrolled bleeding.
 *
 * Anonymous by design. Keyed by drug slug for direct lookup.
 */
export type ChildPughClass = 'A' | 'B' | 'C';

export interface ChildPughGuidance {
  class: ChildPughClass;
  /** "no adjustment" / "reduce by 50%" / "avoid" / etc. — verbatim from the cited source. */
  adjustment: string;
  /** Free text — monitoring, time-of-day, washout, switch-to alternative. */
  notes?: string;
}

export interface HepaticDoseSummary {
  slug: string;
  drugSlug: string;
  drug: string;
  /**
   * One-line clinical headline ("Avoid in Child-Pugh C; halve dose in
   * Child-Pugh B — monitor LFTs and signs of accumulation."). The
   * answer in 7 seconds for the clinician at the bedside.
   */
  oneLiner: string;
  /**
   * The simplest decision: is this drug safe in advanced liver disease?
   * Drives sorting and chips on the frontend.
   */
  worstClassDecision: 'use-with-caution' | 'reduce-dose' | 'avoid' | 'contraindicated';
  domains: string[];
}

export interface HepaticDoseRecord extends HepaticDoseSummary, ContentReviewMetadata {
  /** Mechanism — why hepatic disease affects this drug (CYP metabolism, glucuronidation, biliary excretion, protein binding). */
  mechanism: string;
  /** Per-Child-Pugh-class adjustment guidance (A=mild, B=moderate, C=severe). */
  guidance: ChildPughGuidance[];
  /** Practical monitoring — LFTs, INR, ascites, encephalopathy, drug levels. */
  monitoring?: string;
  /** Acute hepatic failure (not chronic cirrhosis) — separate considerations. */
  acuteFailureGuidance?: string;
  /** Alternatives in advanced liver disease. */
  alternatives?: string[];
  references: Citation[];
}
