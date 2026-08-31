import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { HepaticDoseRecord, HepaticDoseSummary } from './hepatic-dose.types';

/**
 * Hepatic dose adjustment reference. Mirrors the renal adjustment axis
 * for liver disease (Child-Pugh A/B/C). Keyed by drug slug for direct
 * lookup from a prescription.
 */
@Injectable()
export class HepaticDoseService implements OnModuleInit {
  private readonly bySlug = new Map<string, HepaticDoseRecord>();
  private readonly byDrugSlug = new Map<string, HepaticDoseRecord>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    this.byDrugSlug.clear();
    for (const r of this.knowledge.getHepaticDose()) {
      this.bySlug.set(r.slug, r);
      this.byDrugSlug.set(r.drugSlug.toLowerCase(), r);
    }
  }

  list(filters?: { q?: string; decision?: string }): HepaticDoseSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((r) => {
      if (filters?.decision && r.worstClassDecision !== filters.decision) return false;
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const hay = [r.drug, r.drugSlug, r.slug, r.oneLiner, ...r.domains].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(({ slug, drugSlug, drug, oneLiner, worstClassDecision, domains }) => ({
      slug,
      drugSlug,
      drug,
      oneLiner,
      worstClassDecision,
      domains,
    }));
  }

  get(slug: string): HepaticDoseRecord | null {
    return this.bySlug.get(slug) ?? null;
  }

  getByDrugSlug(drugSlug: string): HepaticDoseRecord | null {
    return this.byDrugSlug.get(drugSlug.toLowerCase()) ?? null;
  }
}
