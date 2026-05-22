import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { NotifiableDisease, NotifiableSummary } from './notifiable.types';

@Injectable()
export class NotifiableService implements OnModuleInit {
  private readonly bySlug = new Map<string, NotifiableDisease>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const n of this.knowledge.getNotifiableDiseases()) {
      this.bySlug.set(n.slug, n);
    }
  }

  list(filters?: { level?: string; q?: string }): NotifiableSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((n) => {
      if (filters?.level && n.level !== filters.level) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [n.disease, n.slug, n.conditionSlug ?? '', ...n.domains]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, disease, conditionSlug, level, timeframe, domains }) => ({
      slug,
      disease,
      conditionSlug,
      level,
      timeframe,
      domains,
    }));
  }

  get(slug: string): NotifiableDisease | null {
    return this.bySlug.get(slug) ?? null;
  }
}
