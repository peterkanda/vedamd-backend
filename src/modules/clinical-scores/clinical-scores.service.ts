import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { ClinicalScore, ClinicalScoreSummary } from './clinical-scores.types';

@Injectable()
export class ClinicalScoresService implements OnModuleInit {
  private readonly bySlug = new Map<string, ClinicalScore>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const s of this.knowledge.getClinicalScores()) {
      this.bySlug.set(s.slug, s);
    }
  }

  list(filters?: { domain?: string; q?: string }): ClinicalScoreSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((s) => {
      if (filters?.domain && !s.domains.includes(filters.domain)) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [s.title, s.slug, s.abbrev ?? '', ...s.domains].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, title, abbrev, domains }) => ({ slug, title, abbrev, domains }));
  }

  get(slug: string): ClinicalScore | null {
    return this.bySlug.get(slug) ?? null;
  }
}
