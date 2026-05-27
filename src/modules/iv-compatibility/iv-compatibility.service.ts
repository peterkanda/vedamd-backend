import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { IvCompatibility, IvCompatibilitySummary } from './iv-compatibility.types';

/**
 * Curated IV compatibility reference. NOT a full Trissel's replacement —
 * we cover the highest-mortality and most-frequently-asked inpatient
 * pairs. Lookup is bidirectional: querying by either drug returns every
 * pair the drug appears in.
 */
@Injectable()
export class IvCompatibilityService implements OnModuleInit {
  private readonly bySlug = new Map<string, IvCompatibility>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const c of this.knowledge.getIvCompatibility()) {
      this.bySlug.set(c.slug, c);
    }
  }

  list(filters?: {
    q?: string;
    drug?: string;
    status?: string;
  }): IvCompatibilitySummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((c) => {
      if (filters?.status && c.status !== filters.status) return false;
      if (filters?.drug) {
        const d = filters.drug.toLowerCase();
        const hay = [c.drugA, c.drugB, c.drugASlug ?? '', c.drugBSlug ?? '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(d)) return false;
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const hay = [
          c.drugA,
          c.drugB,
          c.slug,
          c.oneLiner,
          c.status,
          ...c.domains,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(
      ({ slug, drugA, drugASlug, drugB, drugBSlug, status, oneLiner, domains }) => ({
        slug,
        drugA,
        drugASlug,
        drugB,
        drugBSlug,
        status,
        oneLiner,
        domains,
      }),
    );
  }

  get(slug: string): IvCompatibility | null {
    return this.bySlug.get(slug) ?? null;
  }
}
