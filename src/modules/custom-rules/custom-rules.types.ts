import type { CdsCard } from '../cds/cds.types';

/**
 * Per-integrator custom CDS rules — added in the developer portal,
 * evaluated alongside the signed bundle's deterministic strategies and
 * the integrator's uploaded policies. These are NOT shared across
 * tenants and never carry patient identity.
 */
export type CustomRuleIndicator = 'critical' | 'warning' | 'info';

/**
 * Match block. Every present clause must hold for the rule to fire.
 *  - Arrays match if ANY normalised string in the request matches ANY
 *    of the rule's tokens (substring, case-insensitive).
 *  - `hooks`: which CDS hooks the rule applies to (defaults to all).
 *  - Numeric clauses match if the request supplies the value.
 *  - `labs`: an array of { code?, nameContains?, operator, value }
 *    clauses, all of which must hold against the supplied labs.
 */
export interface CustomRuleMatch {
  medications?: string[];
  diagnoses?: string[];
  allergies?: string[];
  hooks?: string[];
  ageMinYears?: number;
  ageMaxYears?: number;
  pregnant?: boolean;
  eGFRBelow?: number;
  labs?: Array<{
    code?: string;
    nameContains?: string;
    operator: '>' | '>=' | '<' | '<=' | '==';
    value: number;
  }>;
}

export interface CustomRuleCard {
  summary: string;
  detail?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  suggestions?: Array<{ label: string; uuid?: string }>;
  links?: Array<{ label: string; url: string; type?: 'absolute' | 'smart' }>;
}

export interface CustomRuleSummary {
  id: string;
  name: string;
  description?: string;
  indicator: CustomRuleIndicator;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRule extends CustomRuleSummary {
  integratorId: string;
  match: CustomRuleMatch;
  card: CustomRuleCard;
  createdBy?: string;
}

export interface CustomRuleCreateDto {
  name: string;
  description?: string;
  indicator: CustomRuleIndicator;
  enabled?: boolean;
  match: CustomRuleMatch;
  card: CustomRuleCard;
}

export interface CustomRuleUpdateDto extends Partial<CustomRuleCreateDto> {}

/**
 * Compiled card emitted by a custom rule — the engine wraps the bare
 * card with the standard `extension` block so deduplication, telemetry,
 * and indicator merging behave exactly as for built-in cards.
 */
export interface CustomRuleEvaluation {
  rule: CustomRuleSummary;
  card: CdsCard;
}
