import { Injectable, OnModuleInit } from '@nestjs/common';
import { calculateDose } from './drugs.dosing';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  AwareCategory,
  DosingInput,
  DosingResult,
  DrugInteraction,
  DrugRecord,
  DrugSummary,
} from './drugs.types';

export interface ListFilters {
  q?: string;
  atc?: string;
  aware?: AwareCategory;
  kemlOnly?: boolean;
}

@Injectable()
export class DrugsService implements OnModuleInit {
  private bySlug = new Map<string, DrugRecord>();
  private interactionsByPair = new Map<string, DrugInteraction>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug = new Map(this.knowledge.getDrugs().map((d) => [d.slug, d]));
    this.interactionsByPair = new Map(
      this.knowledge.getInteractions().map((i) => [pairKey(i.slugA, i.slugB), i]),
    );
  }

  list(filters: ListFilters = {}): DrugSummary[] {
    const q = filters.q?.toLowerCase();
    return [...this.bySlug.values()]
      .filter((d) => {
        if (filters.atc && !d.atc.some((c) => c.toLowerCase() === filters.atc!.toLowerCase())) {
          return false;
        }
        if (filters.aware && d.awareCategory !== filters.aware) return false;
        if (filters.kemlOnly && !d.kemlLevel) return false;
        if (q) {
          const haystack = [d.slug, d.inn, d.drugClass, ...d.tradeNames, ...d.atc, d.rxnorm ?? '']
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .map(({ slug, inn, tradeNames, atc, awareCategory, kemlLevel, drugClass }) => ({
        slug,
        inn,
        tradeNames,
        atc,
        awareCategory,
        kemlLevel,
        drugClass,
      }));
  }

  get(slug: string): DrugRecord | null {
    return this.bySlug.get(slug) ?? null;
  }

  calculateDose(slug: string, input: DosingInput): DosingResult | null {
    const drug = this.bySlug.get(slug);
    if (!drug) return null;
    return calculateDose(drug, input);
  }

  checkInteractions(slugs: string[]): {
    interactions: DrugInteraction[];
    unknownSlugs: string[];
  } {
    const unique = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const unknown = unique.filter((s) => !this.bySlug.has(s));
    const known = unique.filter((s) => this.bySlug.has(s));

    const found: DrugInteraction[] = [];
    for (let i = 0; i < known.length; i++) {
      for (let j = i + 1; j < known.length; j++) {
        const hit = this.interactionsByPair.get(pairKey(known[i], known[j]));
        if (hit) found.push(hit);
      }
    }

    return { interactions: found, unknownSlugs: unknown };
  }
}

function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
}
