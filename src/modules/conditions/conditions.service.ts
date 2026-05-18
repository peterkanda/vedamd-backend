import { Injectable } from '@nestjs/common';
import { SEED_CONDITIONS } from './conditions.seed';
import type { ConditionGuidance, ConditionSummary } from './conditions.types';

@Injectable()
export class ConditionsService {
  private readonly bySlug = new Map<string, ConditionGuidance>(
    SEED_CONDITIONS.map((c) => [c.slug, c]),
  );

  list(filters?: { domain?: string; q?: string }): ConditionSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((c) => {
      if (filters?.domain && !c.domains.includes(filters.domain)) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        if (
          !c.title.toLowerCase().includes(q) &&
          !c.slug.includes(q) &&
          !c.icd10.some((code) => code.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
    return filtered.map(({ slug, title, icd10, domains }) => ({ slug, title, icd10, domains }));
  }

  get(slug: string): ConditionGuidance | null {
    return this.bySlug.get(slug) ?? null;
  }
}
