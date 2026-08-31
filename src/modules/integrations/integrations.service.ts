import { Injectable } from '@nestjs/common';
import {
  INTEGRATIONS,
  type Integration,
  type IntegrationCategory,
  type IntegrationMethod,
  type IntegrationSummary,
} from './integrations.data';

interface ListFilters {
  category?: IntegrationCategory;
  method?: IntegrationMethod;
  q?: string;
}

@Injectable()
export class IntegrationsService {
  private readonly bySlug = new Map<string, Integration>(INTEGRATIONS.map((i) => [i.slug, i]));

  list(filters: ListFilters = {}): IntegrationSummary[] {
    return INTEGRATIONS.filter((i) => {
      if (filters.category && i.category !== filters.category) return false;
      if (filters.method && !i.methods.includes(filters.method)) return false;
      if (filters.q) {
        const needle = filters.q.toLowerCase();
        const haystack = [
          i.slug,
          i.name,
          i.tagline,
          i.description,
          ...i.tags,
          ...i.methods,
          i.category,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    }).map(
      ({ slug, name, category, tagline, primaryMethod, methods, tags }) =>
        ({ slug, name, category, tagline, primaryMethod, methods, tags }) as IntegrationSummary,
    );
  }

  get(slug: string): Integration | null {
    return this.bySlug.get(slug) ?? null;
  }
}
