import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { SymptomTriageRecord, SymptomTriageSummary } from './symptom-triage.types';

/**
 * Symptom-triage / differential-diagnosis reference. Backward-chaining
 * counterpart to the forward-chaining CDS hooks — the clinician asks
 * "what could this be?" and gets the ranked DDx + red flags.
 */
@Injectable()
export class SymptomTriageService implements OnModuleInit {
  private readonly bySlug = new Map<string, SymptomTriageRecord>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const r of this.knowledge.getSymptomTriage()) {
      this.bySlug.set(r.slug, r);
    }
  }

  list(filters?: {
    q?: string;
    population?: string;
    domain?: string;
  }): SymptomTriageSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((r) => {
      if (filters?.population && r.populationScope !== filters.population) return false;
      if (filters?.domain && !r.domains.includes(filters.domain.toLowerCase())) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const hay = [r.chiefComplaint, r.slug, r.oneLiner, ...r.domains].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, chiefComplaint, oneLiner, domains, populationScope }) => ({
      slug,
      chiefComplaint,
      oneLiner,
      domains,
      populationScope,
    }));
  }

  get(slug: string): SymptomTriageRecord | null {
    return this.bySlug.get(slug) ?? null;
  }
}
