import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open toxicology antidote reference: poison/toxin -> antidote, with
 * mechanism and dosing guidance. Reference content only, anonymous by
 * design. Links to the drug record for the antidote and the condition
 * record for the poisoning where they exist.
 */
export interface AntidoteSummary {
  slug: string;
  /** The poison / toxin / overdose scenario. */
  poison: string;
  /** Human-readable antidote name. */
  antidote: string;
  /** Slug of the antidote's drug record, when one exists. */
  antidoteDrugSlug?: string | null;
  /** Slug of the related poisoning condition, when one exists. */
  conditionSlug?: string | null;
  domains: string[];
}

export interface Antidote extends AntidoteSummary, ContentReviewMetadata {
  mechanism: string;
  dosing: string;
  references: { label: string; url?: string }[];
}
