import type { Citation } from '../../common/citation';
import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open drug allergy cross-reactivity knowledge, including common myths to
 * dispel (e.g. sulfonamide-antibiotic vs diuretics, contrast vs shellfish).
 * Reference content only, anonymous by design.
 */
export type CrossReactivityRisk = 'high' | 'moderate' | 'low' | 'negligible';

export interface AllergyCrossReactivitySummary {
  slug: string;
  /** Primary allergen / drug class. */
  allergen: string;
  /** What it may (or is wrongly believed to) cross-react with. */
  crossReactsWith: string;
  risk: CrossReactivityRisk;
  domains: string[];
}

export interface AllergyCrossReactivity
  extends AllergyCrossReactivitySummary, ContentReviewMetadata {
  mechanism: string;
  recommendation: string;
  /** Related drug-record slugs, where they exist in the catalogue. */
  drugSlugs: string[];
  references: Citation[];
}
