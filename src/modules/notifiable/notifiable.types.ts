import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open public-health reporting reference: which diseases are notifiable
 * and how urgently (WHO IHR + commonly nationally-notifiable diseases).
 * Reference content only, anonymous by design. National lists vary —
 * this is guidance, not a substitute for the local statutory list.
 */
export type NotifiableLevel =
  | 'ihr-always'
  | 'ihr-assess'
  | 'national-immediate'
  | 'national-routine';

export interface NotifiableSummary {
  slug: string;
  disease: string;
  /** Slug of the related condition record, when one exists. */
  conditionSlug?: string | null;
  level: NotifiableLevel;
  /** Reporting urgency / window. */
  timeframe: string;
  domains: string[];
}

export interface NotifiableDisease extends NotifiableSummary, ContentReviewMetadata {
  notes?: string | null;
  references: { label: string; url?: string }[];
}
