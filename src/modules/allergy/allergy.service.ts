import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { AllergyCrossReactivity, AllergyCrossReactivitySummary } from './allergy.types';

@Injectable()
export class AllergyService implements OnModuleInit {
  private readonly bySlug = new Map<string, AllergyCrossReactivity>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const a of this.knowledge.getAllergyCrossReactivity()) {
      this.bySlug.set(a.slug, a);
    }
  }

  list(filters?: { drug?: string; risk?: string; q?: string }): AllergyCrossReactivitySummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((a) => {
      if (filters?.drug) {
        const d = filters.drug.toLowerCase();
        const inSlugs = a.drugSlugs.some((s) => s.toLowerCase() === d);
        const inText = (a.allergen + ' ' + a.crossReactsWith).toLowerCase().includes(d);
        if (!inSlugs && !inText) return false;
      }
      if (filters?.risk && a.risk !== filters.risk) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [a.allergen, a.crossReactsWith, a.slug, ...a.domains]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, allergen, crossReactsWith, risk, domains }) => ({
      slug,
      allergen,
      crossReactsWith,
      risk,
      domains,
    }));
  }

  get(slug: string): AllergyCrossReactivity | null {
    return this.bySlug.get(slug) ?? null;
  }
}
