import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { DrugDiseaseInteraction, DrugDiseaseSummary } from './drug-disease.types';

@Injectable()
export class DrugDiseaseService implements OnModuleInit {
  private readonly bySlug = new Map<string, DrugDiseaseInteraction>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const i of this.knowledge.getDrugDiseaseInteractions()) {
      this.bySlug.set(i.slug, i);
    }
  }

  list(filters?: {
    drug?: string;
    condition?: string;
    severity?: string;
    q?: string;
  }): DrugDiseaseSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((i) => {
      if (filters?.drug) {
        const d = filters.drug.toLowerCase();
        const slugMatch = (i.drugSlug ?? '').toLowerCase() === d;
        const nameMatch = (i.drug ?? '').toLowerCase().includes(d);
        if (!slugMatch && !nameMatch) return false;
      }
      if (filters?.condition) {
        const c = filters.condition.toLowerCase();
        if ((i.conditionSlug ?? '').toLowerCase() !== c && !i.condition.toLowerCase().includes(c)) {
          return false;
        }
      }
      if (filters?.severity && i.severity !== filters.severity) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [i.drug, i.condition, i.slug, i.drugClass ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, drugSlug, drug, condition, conditionSlug, severity }) => ({
      slug,
      drugSlug,
      drug,
      condition,
      conditionSlug,
      severity,
    }));
  }

  get(slug: string): DrugDiseaseInteraction | null {
    return this.bySlug.get(slug) ?? null;
  }
}
