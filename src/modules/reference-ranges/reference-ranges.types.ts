import type { Citation } from '../../common/citation';
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
  /**
   * LOINC code for the analyte, property-matched to the unit (e.g. the
   * moles/volume LOINC for SI-unit chemistry). Present only where a code
   * has been verified; absent where no property-matched code was confirmed.
   */
  loinc?: string;
  notes?: string | null;
  /**
   * Population the interval was derived for. Absent means ADULT — every
   * range in the v0.1 bundle is an adult interval, which the catalogue
   * description has always said but the records themselves never stated.
   *
   * Consumers must not present an unbanded interval as universal: the
   * analytes that move most with age (haemoglobin, creatinine, alkaline
   * phosphatase, white cell count, bilirubin) are exactly the ones where
   * an adult number is plausible, precise and wrong for a child.
   */
  ageGroup?: 'adult' | 'paediatric' | 'neonatal' | 'any';
  /** Inclusive lower bound of the age band, in months. */
  ageMinMonths?: number | null;
  /** Exclusive upper bound of the age band, in months. */
  ageMaxMonths?: number | null;
  /**
   * Values demanding action rather than interpretation. Distinct from
   * `low`/`high`, which bound the normal interval: a potassium of 6.0 is
   * outside the reference range, a potassium of 7.5 is an emergency.
   * Absent means no critical threshold has been authored yet — never that
   * the analyte has none.
   */
  criticalLow?: number | null;
  criticalHigh?: number | null;
  references: Citation[];
}

/**
 * Population statement for a range, for display and for grounding. Derived
 * rather than stored so unbanded v0.1 records still say what they are.
 */
export function populationNote(
  r: Pick<ReferenceRange, 'ageGroup' | 'ageMinMonths' | 'ageMaxMonths'>,
): string {
  const band = describeAgeBand(r.ageMinMonths, r.ageMaxMonths);
  switch (r.ageGroup) {
    case 'neonatal':
      return `Neonatal reference interval${band}.`;
    case 'paediatric':
      return `Paediatric reference interval${band}.`;
    case 'any':
      return 'Applies across all ages.';
    default:
      return 'ADULT reference interval — not validated for children or neonates; confirm a paediatric range before applying it to a child.';
  }
}

function describeAgeBand(min?: number | null, max?: number | null): string {
  const fmt = (m: number): string =>
    m < 1 ? `${Math.round(m * 30)} days` : m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`;
  if (min != null && max != null) return ` for ${fmt(min)} to ${fmt(max)}`;
  if (min != null) return ` from ${fmt(min)}`;
  if (max != null) return ` up to ${fmt(max)}`;
  return '';
}
