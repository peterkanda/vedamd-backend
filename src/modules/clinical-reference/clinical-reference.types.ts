import type { Citation } from '../../common/citation';
import type { ContentReviewMetadata } from '../conditions/conditions.types';

/**
 * Unified clinical-reference card shared by four reference domains that
 * all render the same way (titled sections of bullets or numbered steps):
 *
 *   - clinical-procedures   (nursing care plans, procedures, IPC, fluids)
 *   - bedside-interpretation (ECG, blood gas, lab interpretation, imaging)
 *   - preventive-care        (contraception, stewardship, palliative, counselling)
 *   - growth-development     (growth charts, milestones, paediatric screening)
 *
 * One schema → one validator path → one frontend renderer. Reference
 * content only, anonymous by design; never carries patient data.
 */
export type ReferenceDomain =
  | 'clinical-procedures'
  | 'bedside-interpretation'
  | 'preventive-care'
  | 'growth-development';

export interface ReferenceSection {
  heading: string;
  /** Bullet list — present XOR `steps`. */
  items?: string[];
  /** Ordered steps — present XOR `items`. */
  steps?: Array<{ step: string; detail: string }>;
}

export interface ReferenceCardSummary {
  slug: string;
  title: string;
  category: string;
  domains: string[];
  summary: string;
}

export interface ReferenceCard extends ReferenceCardSummary, ContentReviewMetadata {
  sections: ReferenceSection[];
  redFlags?: string[];
  references: Citation[];
}
