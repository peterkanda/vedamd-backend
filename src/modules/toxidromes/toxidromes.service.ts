import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { Toxidrome, ToxidromeSummary } from './toxidromes.types';

/**
 * Pattern-recognition reference for poisoning syndromes. At 3 a.m. the
 * clinician sees a presentation (sweaty + agitated + tachycardic +
 * dilated pupils), not a poison name — this service returns the
 * matching toxidrome so the differential narrows in seconds.
 */
@Injectable()
export class ToxidromesService implements OnModuleInit {
  private readonly bySlug = new Map<string, Toxidrome>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const t of this.knowledge.getToxidromes()) {
      this.bySlug.set(t.slug, t);
    }
  }

  list(filters?: { q?: string; domain?: string }): ToxidromeSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((t) => {
      if (filters?.domain && !t.domains.includes(filters.domain.toLowerCase())) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [t.name, t.oneLiner, t.slug, ...t.domains, ...t.causativeAgents]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, name, oneLiner, domains, antidoteSlug }) => ({
      slug,
      name,
      oneLiner,
      domains,
      antidoteSlug,
    }));
  }

  get(slug: string): Toxidrome | null {
    return this.bySlug.get(slug) ?? null;
  }
}
