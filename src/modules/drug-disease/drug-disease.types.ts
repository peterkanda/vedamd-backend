import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open drug-disease / drug-condition interaction knowledge: situations
 * where a condition contraindicates or cautions against a drug (e.g.
 * NSAID in CKD, metformin in AKI). Reference content only, anonymous by
 * design. Complements drug-drug interactions.
 */
export type DrugDiseaseSeverity = 'contraindicated' | 'caution';

export interface DrugDiseaseSummary {
  slug: string;
  /** Slug of the related drug record. */
  drugSlug: string;
  /** Human-readable drug or drug-class label. */
  drug: string;
  /** Human-readable condition label. */
  condition: string;
  /** Slug of the related condition record, when one exists. */
  conditionSlug?: string | null;
  severity: DrugDiseaseSeverity;
}

export interface DrugDiseaseInteraction extends DrugDiseaseSummary, ContentReviewMetadata {
  /** Optional drug-class identifier when the rule applies to a class. */
  drugClass?: string;
  mechanism: string;
  recommendation: string;
  references: { label: string; url?: string }[];
}
