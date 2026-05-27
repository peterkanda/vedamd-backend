import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  AnticoagulantReversal,
  AnticoagulantReversalSummary,
} from './anticoagulant-reversal.types';

/**
 * Anticoagulant reversal reference. A bleeding patient on warfarin, a
 * DOAC, heparin or fibrinolytic can die in minutes — the clinician
 * needs the reversal agent, dose, and scenario at the elbow.
 */
@Injectable()
export class AnticoagulantReversalService implements OnModuleInit {
  private readonly bySlug = new Map<string, AnticoagulantReversal>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug.clear();
    for (const r of this.knowledge.getAnticoagulantReversal()) {
      this.bySlug.set(r.slug, r);
    }
  }

  list(filters?: {
    q?: string;
    drugClass?: string;
  }): AnticoagulantReversalSummary[] {
    const all = [...this.bySlug.values()];
    const filtered = all.filter((r) => {
      if (filters?.drugClass) {
        if (!r.drugClass.toLowerCase().includes(filters.drugClass.toLowerCase())) return false;
      }
      if (filters?.q) {
        const q = filters.q.toLowerCase();
        const haystack = [
          r.anticoagulant,
          r.oneLiner,
          r.slug,
          r.drugClass,
          ...r.domains,
          ...r.protocols.map((p) => p.agent),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.map(
      ({ slug, anticoagulant, anticoagulantDrugSlug, drugClass, oneLiner, domains }) => ({
        slug,
        anticoagulant,
        anticoagulantDrugSlug,
        drugClass,
        oneLiner,
        domains,
      }),
    );
  }

  get(slug: string): AnticoagulantReversal | null {
    return this.bySlug.get(slug) ?? null;
  }
}
