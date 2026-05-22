import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open catalogue of typical adult laboratory and vital-sign reference
 * intervals (UCUM units). Reference content only, anonymous by design.
 * These are standard reference values — local laboratory/method-specific
 * ranges always take precedence.
 */
export interface ReferenceRangeSummary {
  slug: string;
  analyte: string;
  specimen: string;
  category: string;
  sex: string;
}

export interface ReferenceRange extends ReferenceRangeSummary, ContentReviewMetadata {
  /** Lower bound of the reference interval (null when not applicable). */
  low: number | null;
  /** Upper bound of the reference interval (null when not applicable). */
  high: number | null;
  /** UCUM unit string (e.g. "mmol/L", "10*9/L", "mm[Hg]"). */
  unit: string;
  notes?: string | null;
  references: { label: string; url?: string }[];
}
