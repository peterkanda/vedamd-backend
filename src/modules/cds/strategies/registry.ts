import { Injectable } from '@nestjs/common';
import { DrugDrugInteractionStrategy } from './ddi.strategy';
import type { CdsRuleStrategy } from './types';

/**
 * Registry of all implemented rule strategies, keyed by CdsRule.type.
 * Rules in the bundle whose type isn't registered are silently
 * skipped at evaluation time (and reported via PHI-free log).
 */
@Injectable()
export class CdsStrategyRegistry {
  private readonly byType = new Map<string, CdsRuleStrategy>();

  constructor(ddi: DrugDrugInteractionStrategy) {
    this.register(ddi);
  }

  register(s: CdsRuleStrategy): void {
    this.byType.set(s.type, s);
  }

  get(type: string): CdsRuleStrategy | null {
    return this.byType.get(type) ?? null;
  }
}
