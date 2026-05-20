import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';

/**
 * Reference organisation service — powers the clinician-facing
 * reference experience (browse, A–Z, grouped, search).
 *
 * This is the READ-ONLY, deterministic reference surface medics use
 * for look-up — distinct from the developer agentic API. It returns
 * the signed bundle content organised for human navigation. No PHI,
 * no patient context, nothing persisted.
 */

export type RefKind = 'drug' | 'condition' | 'procedure';

export interface RefItem {
  kind: RefKind;
  slug: string;
  title: string;
  /** Subtitle / classifier shown in lists (drug class, specialty, etc.). */
  subtitle?: string;
  /** Grouping tags. */
  tags: string[];
}

export interface AlphaGroup {
  letter: string;
  items: RefItem[];
}

export interface NamedGroup {
  group: string;
  count: number;
  items: RefItem[];
}

@Injectable()
export class ReferenceService {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** All reference items as a flat list (drugs + conditions + procedures). */
  private allItems(kinds?: RefKind[]): RefItem[] {
    const want = (k: RefKind) => !kinds || kinds.includes(k);
    const items: RefItem[] = [];
    if (want('drug')) {
      for (const d of this.knowledge.getDrugs()) {
        items.push({
          kind: 'drug',
          slug: d.slug,
          title: titleCase(d.inn),
          subtitle: d.drugClass,
          tags: [
            d.drugClass,
            ...(d.awareCategory ? [`AWaRe: ${d.awareCategory}`] : []),
            ...(d.kemlLevel ? [`KEML L${d.kemlLevel}`] : []),
          ].filter(Boolean) as string[],
        });
      }
    }
    if (want('condition')) {
      for (const c of this.knowledge.getConditions()) {
        items.push({
          kind: 'condition',
          slug: c.slug,
          title: c.title,
          subtitle: (c.domains ?? [])[0],
          tags: c.domains ?? [],
        });
      }
    }
    if (want('procedure')) {
      for (const p of this.knowledge.getProcedures()) {
        items.push({
          kind: 'procedure',
          slug: p.slug,
          title: p.title,
          subtitle: (p.domains ?? [])[0],
          tags: p.domains ?? [],
        });
      }
    }
    return items;
  }

  /** Counts for the reference home screen. */
  summary(): { drugs: number; conditions: number; procedures: number; interactions: number; total: number } {
    const drugs = this.knowledge.getDrugs().length;
    const conditions = this.knowledge.getConditions().length;
    const procedures = this.knowledge.getProcedures().length;
    const interactions = this.knowledge.getInteractions().length;
    return { drugs, conditions, procedures, interactions, total: drugs + conditions + procedures + interactions + this.knowledge.getCdsRules().length };
  }

  /** A–Z index. Optionally filter by kind(s). */
  alphabetical(kinds?: RefKind[]): AlphaGroup[] {
    const byLetter = new Map<string, RefItem[]>();
    for (const item of this.allItems(kinds)) {
      const letter = firstLetter(item.title);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter)!.push(item);
    }
    return [...byLetter.entries()]
      .map(([letter, items]) => ({
        letter,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
  }

  /**
   * Grouped browse. dimension:
   *   drug:      'class' | 'aware' | 'keml'
   *   condition: 'specialty'  (domains)
   *   procedure: 'domain'     (domains)
   */
  grouped(kind: RefKind, dimension: string): NamedGroup[] {
    const items = this.allItems([kind]);
    const groups = new Map<string, RefItem[]>();

    const keyOf = (item: RefItem): string[] => {
      if (kind === 'drug') {
        const d = this.knowledge.getDrugs().find((x) => x.slug === item.slug);
        if (!d) return ['Unclassified'];
        if (dimension === 'aware') return [d.awareCategory ? `AWaRe: ${d.awareCategory}` : 'Not antimicrobial'];
        if (dimension === 'keml') return [d.kemlLevel ? `KEML Level ${d.kemlLevel}` : 'Unlisted'];
        return [d.drugClass || 'Unclassified'];
      }
      // condition + procedure group by their domain tags (multi-membership)
      return item.tags.length ? item.tags : ['Other'];
    };

    for (const item of items) {
      for (const g of keyOf(item)) {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(item);
      }
    }

    return [...groups.entries()]
      .map(([group, list]) => ({
        group,
        count: list.length,
        items: list.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }

  /** Free-text search across titles, slugs, subtitles + tags. */
  search(query: string, kinds?: RefKind[], limit = 50): RefItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    return this.allItems(kinds)
      .map((item) => ({ item, score: searchScore(item, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.item);
  }

  /** Distinct group names for a kind+dimension (for building nav menus). */
  groupNames(kind: RefKind, dimension: string): string[] {
    return this.grouped(kind, dimension).map((g) => g.group);
  }
}

function firstLetter(title: string): string {
  const c = title.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

function titleCase(s: string): string {
  // INN may be lower-case in older records; present consistently.
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function searchScore(item: RefItem, terms: string[]): number {
  const title = item.title.toLowerCase();
  const slug = item.slug.toLowerCase();
  const hay = [title, slug, item.subtitle?.toLowerCase() ?? '', ...item.tags.map((t) => t.toLowerCase())].join(' ');
  let score = 0;
  for (const t of terms) {
    if (title === t || slug === t) score += 10;
    else if (title.startsWith(t) || slug.startsWith(t)) score += 6;
    else if (title.includes(t) || slug.includes(t)) score += 4;
    else if (hay.includes(t)) score += 2;
  }
  return score;
}
