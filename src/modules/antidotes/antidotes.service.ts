import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { Antidote, AntidoteSummary } from './antidotes.types';

@Injectable()
export class AntidotesService implements OnModuleInit {
  private readonly bySlug = new Map<string, Antidote>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const a of this.knowledge.getAntidotes()) {
      this.bySlug.set(a.slug, a);
    }
  }

  list(filters?: { poison?: string; antidote?: string; q?: string }): AntidoteSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((a) => {
      if (filters?.poison && !a.poison.toLowerCase().includes(filters.poison.toLowerCase())) {
        return false;
      }
      if (filters?.antidote) {
        const d = filters.antidote.toLowerCase();
        if (
          !a.antidote.toLowerCase().includes(d) &&
          (a.antidoteDrugSlug ?? '').toLowerCase() !== d
        ) {
          return false;
        }
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [a.poison, a.antidote, a.slug, ...a.domains].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, poison, antidote, antidoteDrugSlug, conditionSlug, domains }) => ({
      slug,
      poison,
      antidote,
      antidoteDrugSlug,
      conditionSlug,
      domains,
    }));
  }

  get(slug: string): Antidote | null {
    return this.bySlug.get(slug) ?? null;
  }
}
