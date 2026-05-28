import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  ReferenceCard,
  ReferenceCardSummary,
  ReferenceDomain,
} from './clinical-reference.types';

export const REFERENCE_DOMAINS: ReferenceDomain[] = [
  'clinical-procedures',
  'bedside-interpretation',
  'preventive-care',
  'growth-development',
];

/**
 * Serves the four unified clinical-reference domains from the signed
 * bundle. One service, one schema, addressed by domain — keeps module
 * sprawl down while each domain still has its own list/detail surface.
 */
@Injectable()
export class ClinicalReferenceService implements OnModuleInit {
  private readonly byDomain = new Map<ReferenceDomain, Map<string, ReferenceCard>>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.byDomain.clear();
    this.hydrate('clinical-procedures', this.knowledge.getClinicalProcedures());
    this.hydrate('bedside-interpretation', this.knowledge.getBedsideInterpretation());
    this.hydrate('preventive-care', this.knowledge.getPreventiveCare());
    this.hydrate('growth-development', this.knowledge.getGrowthDevelopment());
  }

  private hydrate(domain: ReferenceDomain, records: ReferenceCard[]): void {
    const map = new Map<string, ReferenceCard>();
    for (const r of records ?? []) map.set(r.slug, r);
    this.byDomain.set(domain, map);
  }

  isDomain(value: string): value is ReferenceDomain {
    return REFERENCE_DOMAINS.includes(value as ReferenceDomain);
  }

  list(
    domain: ReferenceDomain,
    filters?: { category?: string; q?: string },
  ): ReferenceCardSummary[] {
    const map = this.byDomain.get(domain);
    if (!map) return [];
    return [...map.values()]
      .filter((r) => {
        if (filters?.category && r.category !== filters.category) return false;
        if (filters?.q) {
          const q = filters.q.toLowerCase();
          const haystack = [r.title, r.slug, r.summary, r.category, ...r.domains]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .map(({ slug, title, category, domains, summary }) => ({
        slug,
        title,
        category,
        domains,
        summary,
      }));
  }

  get(domain: ReferenceDomain, slug: string): ReferenceCard | null {
    return this.byDomain.get(domain)?.get(slug) ?? null;
  }
}
