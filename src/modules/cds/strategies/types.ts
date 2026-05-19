import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest } from '../cds.types';

/**
 * A strategy implements one rule.type. It receives the matching
 * rule's declaration (which carries citations and metadata) and the
 * CDS Hooks request body, and returns zero or more cards.
 *
 * Strategies MUST NOT log or persist anything PHI-shaped from the
 * request. They read only the non-identifying clinical signals the
 * rule needs (e.g. medication slugs).
 */
export interface CdsRuleStrategy {
  /** Matches the CdsRule.type field. */
  readonly type: string;
  evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]>;
}
