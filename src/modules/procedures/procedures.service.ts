import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { ProcedureGuidance, ProcedureSummary } from './procedures.types';

@Injectable()
export class ProceduresService implements OnModuleInit {
  private readonly bySlug = new Map<string, ProcedureGuidance>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const p of this.knowledge.getProcedures()) {
      this.bySlug.set(p.slug, p);
    }
  }

  list(filters?: { domain?: string; q?: string }): ProcedureSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((p) => {
      if (filters?.domain && !p.domains.includes(filters.domain)) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [p.title, p.slug, ...(p.cpt ?? []), ...p.domains].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, title, domains, cpt }) => ({ slug, title, domains, cpt }));
  }

  get(slug: string): ProcedureGuidance | null {
    return this.bySlug.get(slug) ?? null;
  }
}
