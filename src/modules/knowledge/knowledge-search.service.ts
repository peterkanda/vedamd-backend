import { Injectable } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

export interface KnowledgeSearchHit {
  /** Content domain the hit came from. */
  domain: string;
  /** Stable identifier within the domain. */
  slug: string;
  /** Display title. */
  title: string;
  /** Frontend route to open the record. */
  route: string;
  /** Short context snippet (subtitle / classification). */
  snippet?: string;
}

interface DomainSpec {
  domain: string;
  records: () => unknown[];
  /** Build the frontend route for a record (by slug). */
  route: (slug: string) => string;
  /** Pull the primary title from a record. */
  title: (r: Record<string, unknown>) => string;
  /** Optional secondary snippet. */
  snippet?: (r: Record<string, unknown>) => string | undefined;
  /** Extra fields (beyond slug+title) to match the query against. */
  haystack?: (r: Record<string, unknown>) => Array<string | undefined | null>;
}

/**
 * Unified full-text-ish search over the in-memory signed bundle.
 *
 * The bundle is already fully resident in KnowledgeService (every getX()
 * returns an in-memory array), so searching it server-side is near-free and
 * avoids shipping multi-megabyte JSON to the browser for a client index.
 * Returns typed, route-addressable hits the command palette renders as an
 * "In VedaMD" group. Anonymous + read-only; no PHI.
 */
@Injectable()
export class KnowledgeSearchService {
  constructor(private readonly knowledge: KnowledgeService) {}

  private specs(): DomainSpec[] {
    const k = this.knowledge;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return [
      {
        domain: 'conditions',
        records: () => k.getConditions(),
        route: (s) => `/app/conditions/${s}`,
        title: (r) => str(r.title),
        snippet: (r) => arr(r.icd10)[0] ?? arr(r.domains)[0],
        haystack: (r) => [...arr(r.icd10), ...arr(r.icd11), ...arr(r.domains)],
      },
      {
        domain: 'drugs',
        records: () => k.getDrugs(),
        route: (s) => `/app/drugs/${s}`,
        title: (r) => str(r.inn) || str(r.title),
        snippet: (r) => str(r.drugClass),
        haystack: (r) => [...arr(r.tradeNames), ...arr(r.atc), str(r.drugClass)],
      },
      {
        domain: 'clinical-scores',
        records: () => k.getClinicalScores() as unknown[],
        route: () => `/app/scores`,
        title: (r) => str(r.title),
        snippet: (r) => str(r.abbrev) || str(r.purpose),
        haystack: (r) => [str(r.abbrev)],
      },
      {
        domain: 'antidotes',
        records: () => k.getAntidotes() as unknown[],
        route: () => `/app/antidotes`,
        title: (r) => `${str(r.antidote)} — ${str(r.poison)}`,
        snippet: (r) => str(r.poison),
        haystack: (r) => [str(r.poison), str(r.antidote)],
      },
      {
        domain: 'toxidromes',
        records: () => k.getToxidromes() as unknown[],
        route: () => `/app/toxidromes`,
        title: (r) => str(r.title) || str(r.name),
      },
      {
        domain: 'symptom-triage',
        records: () => k.getSymptomTriage() as unknown[],
        route: () => `/app/symptom-triage`,
        title: (r) => str(r.chiefComplaint) || str(r.title),
      },
      {
        domain: 'pregnancy-lactation',
        records: () => k.getPregnancyLactation() as unknown[],
        route: () => `/app/pregnancy-lactation`,
        title: (r) => str(r.drug) || str(r.title),
        snippet: (r) => str(r.oneLiner),
      },
      {
        domain: 'hepatic-dose',
        records: () => k.getHepaticDose() as unknown[],
        route: () => `/app/hepatic-dose`,
        title: (r) => str(r.drug) || str(r.title),
        snippet: (r) => str(r.oneLiner),
      },
      {
        domain: 'reference-ranges',
        records: () => k.getReferenceRanges() as unknown[],
        route: () => `/app/reference-ranges`,
        title: (r) => str(r.analyte) || str(r.title),
        snippet: (r) => str(r.specimen),
        haystack: (r) => [str(r.loinc)],
      },
      {
        domain: 'pharmacogenomics',
        records: () => k.getPgxGuidelines() as unknown[],
        route: () => `/app/pharmacogenomics`,
        title: (r) => `${str(r.gene)} — ${str(r.drug)}`,
        snippet: (r) => str(r.phenotype),
        haystack: (r) => [str(r.gene), str(r.drug)],
      },
      {
        domain: 'allergy-cross-reactivity',
        records: () => k.getAllergyCrossReactivity() as unknown[],
        route: () => `/app/allergy`,
        title: (r) => str(r.allergen) || str(r.title),
      },
      {
        domain: 'notifiable-diseases',
        records: () => k.getNotifiableDiseases() as unknown[],
        route: () => `/app/notifiable`,
        title: (r) => str(r.disease) || str(r.title),
      },
      {
        domain: 'immunization',
        records: () => k.getImmunizationSchedule() as unknown[],
        route: () => `/app/immunization`,
        title: (r) => str(r.vaccine) || str(r.title),
        snippet: (r) => str(r.targetDisease),
      },
      {
        domain: 'drug-disease',
        records: () => k.getDrugDiseaseInteractions() as unknown[],
        route: () => `/app/drug-disease`,
        title: (r) => `${str(r.drug)} ↔ ${str(r.disease)}`,
      },
      {
        domain: 'iv-compatibility',
        records: () => k.getIvCompatibility() as unknown[],
        route: () => `/app/iv-compatibility`,
        title: (r) => str(r.title) || `${str(r.drug1)} + ${str(r.drug2)}`,
      },
      {
        domain: 'anticoagulant-reversal',
        records: () => k.getAnticoagulantReversal() as unknown[],
        route: () => `/app/anticoagulant-reversal`,
        title: (r) => str(r.anticoagulant) || str(r.title),
      },
      {
        domain: 'procedures',
        records: () => k.getProcedures(),
        route: () => `/app/tools`,
        title: (r) => str(r.title),
      },
      {
        domain: 'clinical-procedures',
        records: () => k.getClinicalProcedures() as unknown[],
        route: (s) => `/app/clinical-procedures/${s}`,
        title: (r) => str(r.title),
        snippet: (r) => str(r.category),
      },
      {
        domain: 'bedside-interpretation',
        records: () => k.getBedsideInterpretation() as unknown[],
        route: (s) => `/app/bedside-interpretation/${s}`,
        title: (r) => str(r.title),
        snippet: (r) => str(r.category),
      },
      {
        domain: 'preventive-care',
        records: () => k.getPreventiveCare() as unknown[],
        route: (s) => `/app/preventive-care/${s}`,
        title: (r) => str(r.title),
        snippet: (r) => str(r.category),
      },
      {
        domain: 'growth-development',
        records: () => k.getGrowthDevelopment() as unknown[],
        route: (s) => `/app/growth-development/${s}`,
        title: (r) => str(r.title),
        snippet: (r) => str(r.category),
      },
    ];
  }

  search(query: string, limit = 40): KnowledgeSearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];

    const perDomainCap = 10;
    const scored: { hit: KnowledgeSearchHit; score: number }[] = [];

    for (const spec of this.specs()) {
      let records: unknown[];
      try {
        records = spec.records();
      } catch {
        continue;
      }
      let count = 0;
      for (const raw of records) {
        if (count >= perDomainCap) break;
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        const slug = typeof r.slug === 'string' ? r.slug : '';
        const title = spec.title(r);
        const extra = spec.haystack ? spec.haystack(r) : [];

        const titleWords = words(title);
        const allWords = words([slug, title, ...extra].filter(Boolean).join(' '));

        // Relevance gate: EVERY query token must match a word (exact or as a
        // word prefix) somewhere in the record. Prefix-of-word matching means
        // "morph" hits "morphine" but "art" no longer hits "heart".
        if (!tokens.every((tok) => matchesWord(tok, allWords))) continue;

        scored.push({
          hit: {
            domain: spec.domain,
            slug,
            title: title || slug,
            route: spec.route(slug),
            snippet: spec.snippet?.(r) || undefined,
          },
          score: relevance(q, tokens, title.toLowerCase(), titleWords),
        });
        count += 1;
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.hit);
  }
}

/** Lowercased word set from a string (split on non-alphanumeric). */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A token matches if some word equals it or starts with it (autocomplete). */
function matchesWord(token: string, wordList: string[]): boolean {
  return wordList.some((w) => w === token || w.startsWith(token));
}

/** Higher = more relevant. Rewards exact/prefix title matches and tokens that
 *  land in the title rather than only in secondary fields. */
function relevance(q: string, tokens: string[], titleLower: string, titleWords: string[]): number {
  let s = 0;
  if (titleLower === q) s += 1000;
  else if (titleLower.startsWith(q)) s += 500;
  else if (titleLower.includes(q)) s += 200;

  let inTitle = 0;
  for (const tok of tokens) {
    if (matchesWord(tok, titleWords)) {
      s += 10;
      inTitle += 1;
    } else {
      s += 2; // matched only in slug/secondary fields
    }
  }
  if (inTitle === tokens.length) s += 50; // every token is in the title
  return s;
}
