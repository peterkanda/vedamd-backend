import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { RenalDoseRecord, RenalDoseSummary } from './renal-dose.types';

/**
 * Renal dose adjustment reference. Mirrors the hepatic adjustment axis
 * for kidney disease (eGFR bands: normal/mild/moderate/severe/esrd).
 * Keyed by drug slug for direct lookup from a prescription.
 */
@Injectable()
export class RenalDoseService implements OnModuleInit {
  private readonly bySlug = new Map<string, RenalDoseRecord>();
  private readonly byDrugSlug = new Map<string, RenalDoseRecord>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    this.byDrugSlug.clear();
    for (const r of this.knowledge.getRenalDose()) {
      this.bySlug.set(r.slug, r);
      this.byDrugSlug.set(r.drugSlug.toLowerCase(), r);
    }
  }

  list(filters?: { q?: string; decision?: string }): RenalDoseSummary[] {
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

  get(slug: string): RenalDoseRecord | null {
    return this.bySlug.get(slug) ?? null;
  }

  getByDrugSlug(drugSlug: string): RenalDoseRecord | null {
    return this.byDrugSlug.get(drugSlug.toLowerCase()) ?? null;
  }
}
