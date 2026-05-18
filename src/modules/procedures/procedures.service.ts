import { Injectable } from '@nestjs/common';
import { SEED_PROCEDURES } from './procedures.seed';
import type { ProcedureGuidance, ProcedureSummary } from './procedures.types';

@Injectable()
export class ProceduresService {
  private readonly bySlug = new Map<string, ProcedureGuidance>(
    SEED_PROCEDURES.map((p) => [p.slug, p]),
  );

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
