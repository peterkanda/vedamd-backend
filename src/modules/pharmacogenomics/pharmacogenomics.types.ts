import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Open pharmacogenomics layer: CPIC-style gene-drug guidance. Reference
 * content only, anonymous by design — the integrator asks "what does this
 * gene-drug pair imply?" and gets phenotype-based recommendations. No
 * patient genotype or identity is stored or processed here.
 */
export interface PgxPhenotype {
  /** Metaboliser/allele phenotype (e.g. "Poor metaboliser", "HLA-B*57:01 positive"). */
  phenotype: string;
  /** Clinical implication of this phenotype for the drug. */
  implication: string;
  /** Actionable recommendation. */
  recommendation: string;
  /** Optional CPIC-style recommendation strength (e.g. Strong, Moderate). */
  strength?: string;
}

export interface PgxSummary {
  slug: string;
  gene: string;
  drug: string;
  /** Slug of the related drug record, when one exists in the drug catalogue. */
  drugSlug?: string | null;
  domains: string[];
}

export interface PgxGuideline extends PgxSummary, ContentReviewMetadata {
  /** Allele/variant the guidance is keyed on. */
  variant: string;
  summary: string;
  phenotypes: PgxPhenotype[];
  /** When/whether to test. */
  testing?: string;
  references: { label: string; url?: string }[];
}
