import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { ReferenceRange, ReferenceRangeSummary } from './reference-ranges.types';

@Injectable()
export class ReferenceRangesService implements OnModuleInit {
  private readonly bySlug = new Map<string, ReferenceRange>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const r of this.knowledge.getReferenceRanges()) {
      this.bySlug.set(r.slug, r);
    }
  }

  list(filters?: { category?: string; q?: string }): ReferenceRangeSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((r) => {
      if (filters?.category && r.category !== filters.category) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [r.analyte, r.slug, r.category, r.specimen].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, analyte, specimen, category, sex }) => ({
      slug,
      analyte,
      specimen,
      category,
      sex,
    }));
  }

  get(slug: string): ReferenceRange | null {
    return this.bySlug.get(slug) ?? null;
  }
}
