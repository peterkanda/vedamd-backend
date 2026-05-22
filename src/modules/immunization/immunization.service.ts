import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { ImmunizationScheduleEntry, ImmunizationSummary } from './immunization.types';

@Injectable()
export class ImmunizationService implements OnModuleInit {
  private readonly bySlug = new Map<string, ImmunizationScheduleEntry>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const e of this.knowledge.getImmunizationSchedule()) {
      this.bySlug.set(e.slug, e);
    }
  }

  list(filters?: { disease?: string; q?: string }): ImmunizationSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((e) => {
      if (filters?.disease) {
        const d = filters.disease.toLowerCase();
        if (!e.targetDisease.some((t) => t.toLowerCase().includes(d))) return false;
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [e.vaccine, e.abbrev ?? '', e.slug, ...e.targetDisease, ...e.domains]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, vaccine, abbrev, vaccineDrugSlug, targetDisease, domains }) => ({
      slug,
      vaccine,
      abbrev,
      vaccineDrugSlug,
      targetDisease,
      domains,
    }));
  }

  get(slug: string): ImmunizationScheduleEntry | null {
    return this.bySlug.get(slug) ?? null;
  }
}
