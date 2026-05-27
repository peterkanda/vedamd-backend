import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  PregnancyLactationRecord,
  PregnancyLactationSummary,
} from './pregnancy-lactation.types';

/**
 * Pregnancy + Lactation reference (PLLR-format narrative + LactMed-style
 * detail). Keyed by drug slug — the integrator asks "what about this
 * drug in pregnancy?" and gets the structured narrative, not a letter.
 */
@Injectable()
export class PregnancyLactationService implements OnModuleInit {
  private readonly bySlug = new Map<string, PregnancyLactationRecord>();
  private readonly byDrugSlug = new Map<string, PregnancyLactationRecord>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    this.byDrugSlug.clear();
    for (const r of this.knowledge.getPregnancyLactation()) {
      this.bySlug.set(r.slug, r);
      this.byDrugSlug.set(r.drugSlug.toLowerCase(), r);
    }
  }

  list(filters?: {
    q?: string;
    pregnancy?: string;
    lactation?: string;
  }): PregnancyLactationSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((r) => {
      if (filters?.pregnancy && r.pregnancyCompatibility !== filters.pregnancy) return false;
      if (filters?.lactation && r.lactationCompatibility !== filters.lactation) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const hay = [r.drug, r.drugSlug, r.slug, r.oneLiner, ...r.domains]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(
      ({
        slug,
        drugSlug,
        drug,
        oneLiner,
        pregnancyCompatibility,
        lactationCompatibility,
        domains,
        legacyFdaCategory,
      }) => ({
        slug,
        drugSlug,
        drug,
        oneLiner,
        pregnancyCompatibility,
        lactationCompatibility,
        domains,
        legacyFdaCategory,
      }),
    );
  }

  get(slug: string): PregnancyLactationRecord | null {
    return this.bySlug.get(slug) ?? null;
  }

  /** Reverse lookup — for an integrator who only has the drug slug. */
  getByDrugSlug(drugSlug: string): PregnancyLactationRecord | null {
    return this.byDrugSlug.get(drugSlug.toLowerCase()) ?? null;
  }
}
