import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { PgxGuideline, PgxSummary } from './pharmacogenomics.types';

@Injectable()
export class PharmacogenomicsService implements OnModuleInit {
  private readonly bySlug = new Map<string, PgxGuideline>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const g of this.knowledge.getPgxGuidelines()) {
      this.bySlug.set(g.slug, g);
    }
  }

  list(filters?: { gene?: string; drug?: string; q?: string }): PgxSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((g) => {
      if (filters?.gene && !g.gene.toLowerCase().includes(filters.gene.toLowerCase())) return false;
      if (filters?.drug) {
        const d = filters.drug.toLowerCase();
        if (!g.drug.toLowerCase().includes(d) && (g.drugSlug ?? '').toLowerCase() !== d) {
          return false;
        }
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [g.gene, g.drug, g.variant, g.slug, ...g.domains].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, gene, drug, drugSlug, domains }) => ({
      slug,
      gene,
      drug,
      drugSlug,
      domains,
    }));
  }

  get(slug: string): PgxGuideline | null {
    return this.bySlug.get(slug) ?? null;
  }
}
