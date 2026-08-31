import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';

/**
 * Generic content-card strategy.
 *
 * Renders one CDS card per entry in a rule's `outcomes[]`, straight from
 * the signed bundle — no per-rule TypeScript. This is how the ~250+
 * content-only rules (clinical pathways declared in cds-rules.json with
 * fully-written summary/detail but no executable logic) reach the
 * clinician instead of being silently skipped.
 *
 * Dispatch: CdsService falls back to this strategy when a rule's `type`
 * has no bespoke strategy registered AND the rule carries outcomes. A
 * rule with a bespoke strategy never reaches here (the registry resolves
 * its type first), so there is no double-firing.
 *
 * Every card inherits the rule's citation (references[0]) and review
 * status, exactly like a bespoke-strategy card — the SafetyBanner still
 * flags draft content.
 */
@Injectable()
export class BundleOutcomeStrategy {
  /** Sentinel — not resolved by type. CdsService invokes it as a fallback. */
  readonly type = '__bundle-outcome__';

  async evaluate(rule: CdsRule, _req: CdsHookRequest): Promise<CdsCard[]> {
    const outcomes = rule.outcomes ?? [];
    if (outcomes.length === 0) return [];

    return outcomes.map((o): CdsCard => {
      const detailParts: string[] = [];
      if (o.detail) detailParts.push(o.detail);
      if (o.suggestion) detailParts.push(`**Suggestion.** ${o.suggestion}`);
      return {
        summary: o.summary,
        detail: detailParts.length ? detailParts.join('\n\n') : undefined,
        indicator: normaliseIndicator(o.indicator),
        source: {
          label: rule.references[0]?.label ?? rule.title ?? 'VedaMD clinical content',
          url: rule.references[0]?.url,
        },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }
}

function normaliseIndicator(value: unknown): CdsIndicator {
  return value === 'critical' || value === 'warning' ? value : 'info';
}
