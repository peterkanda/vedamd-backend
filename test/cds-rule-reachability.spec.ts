import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { makeKnowledgeService } from './helpers/knowledge';
import { CdsService } from '../src/modules/cds/cds.service';
import type { CdsStrategyRegistry } from '../src/modules/cds/strategies/registry';
import type { CdsNormalizerService } from '../src/modules/cds/normalize/cds-normalizer.service';
import { PhiFreeLogger } from '../src/common/phi-free-logger';

/**
 * A rule runs only when some CDS service's hook matches the rule's hook and
 * (if the rule names services) the service is one of them. cds-rule-coverage
 * checks rule → strategy; this checks the other direction a clinician
 * depends on: that a rule can be reached at all.
 *
 * The lists below are KNOWN content defects, not accepted behaviour. Fixing
 * them means editing and re-signing the bundle (clinical content), so they
 * are pinned here: the test fails if a new one appears, and must be updated
 * when these are fixed.
 */
const KNOWN_UNREACHABLE_RULES = [
  // hook is medication-prescribe, but its only service is a patient-view one.
  'uti-treatment-trimethoprim-nitrofurantoin',
];
const SAFETY_STRATEGIES_WITHOUT_A_RULE = [
  // Implemented and tested, but no bundle rule has these types, so they never
  // run in production.
  'drug-allergy-cross-reactivity',
  'hepatic-safety',
];

const knowledge = makeKnowledgeService();
const cds = new CdsService(
  { get: () => undefined } as unknown as ConfigService<never, true>,
  new PhiFreeLogger({ service: 't', hashSecret: 's', strict: true, level: 'fatal' }),
  knowledge,
  {} as CdsStrategyRegistry,
  {} as CdsNormalizerService,
);

describe('CDS rule reachability', () => {
  const services = cds.listServices();
  const reachable = (rule: { hook?: string | null; services?: string[] }) =>
    services.some(
      (s) =>
        (rule.hook === s.hook ||
          ((s.hook === 'order-select' || s.hook === 'order-sign') &&
            rule.hook === 'medication-prescribe')) &&
        (rule.services === undefined || rule.services.includes(s.id)),
    );

  it('every rule is reachable from some service, except the known defects', () => {
    const unreachable = knowledge
      .getCdsRules()
      .filter((r) => !r.documentationOnly && !r.outcomes?.length && !reachable(r))
      .map((r) => r.id)
      .filter((id) => {
        const r = knowledge.getCdsRules().find((x) => x.id === id)!;
        return typeof r.type === 'string' && r.type.length > 0;
      });
    expect(unreachable).toEqual(KNOWN_UNREACHABLE_RULES);
  });

  it('safety strategies with no bundle rule are exactly the known ones', () => {
    const types = new Set(knowledge.getCdsRules().map((r) => r.type));
    const missing = [
      'drug-drug-interaction',
      'drug-allergy-cross-reactivity',
      'renal-safety',
      'hepatic-safety',
      'pregnancy-safety',
    ].filter((t) => !types.has(t));
    expect(missing).toEqual(SAFETY_STRATEGIES_WITHOUT_A_RULE);
  });
});
