import { Injectable, OnModuleInit } from '@nestjs/common';
import { calculateDose, matchRenal } from './drugs.dosing';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { DrugDiseaseInteraction } from '../drug-disease/drug-disease.types';
import type { AllergyCrossReactivity, CrossReactivityRisk } from '../allergy/allergy.types';
import type { Citation } from '../../common/citation';
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
  private drugDiseaseInteractions: DrugDiseaseInteraction[] = [];
  private allergyCrossReactivity: AllergyCrossReactivity[] = [];

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bySlug = new Map(this.knowledge.getDrugs().map((d) => [d.slug, d]));
    this.interactionsByPair = new Map(
      this.knowledge.getInteractions().map((i) => [pairKey(i.slugA, i.slugB), i]),
    );
    this.drugDiseaseInteractions = this.knowledge.getDrugDiseaseInteractions() ?? [];
    this.allergyCrossReactivity = this.knowledge.getAllergyCrossReactivity() ?? [];
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
    // `unknownSlugs` flags slugs with no monograph AND no interaction record,
    // but the pair scan runs over ALL supplied slugs: some interaction records
    // reference agents that have no monograph yet (e.g. dipyridamole, ethanol),
    // and filtering those out before the scan silently suppressed reviewed
    // interactions — a false "no known interactions" on a flagged combination.
    const unknown = unique.filter((s) => !this.bySlug.has(s) && !this.slugHasInteractions(s));

    const found: DrugInteraction[] = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const hit = this.interactionsByPair.get(pairKey(unique[i], unique[j]));
        if (hit) found.push(hit);
      }
    }

    return { interactions: found, unknownSlugs: unknown };
  }

  /**
   * Holistic medication safety review for a med list — the point-of-care panel
   * a world-class CDS (Medscape/UpToDate-style) gives: pairwise interactions
   * PLUS antimicrobial-stewardship (AWaRe Watch/Reserve) flags and
   * duplicate-therapy (same drug class) detection, in one call. Deterministic,
   * derived from the signed drug records — no LLM.
   */
  safetyReview(
    slugs: string[],
    crClMlMin?: number,
    weightKg?: number,
    conditions?: string[],
    allergies?: string[],
  ): {
    interactions: DrugInteraction[];
    stewardship: Array<{ slug: string; inn: string; awareCategory: AwareCategory }>;
    duplicateTherapy: Array<{ drugClass: string; slugs: string[] }>;
    pregnancyContraindications: Array<{
      slug: string;
      inn: string;
      category?: string;
      notes: string;
    }>;
    renalFlags: Array<{
      slug: string;
      inn: string;
      crClMlMin: number;
      prohibited: boolean;
      adjustment: string;
    }>;
    hepaticGuidance: Array<{ slug: string; inn: string; guidance: string }>;
    paediatricDosing: Array<{
      slug: string;
      inn: string;
      mgPerDose: number;
      maxMgPerDay?: number;
      route: string;
      frequency: string;
      uncapped: boolean;
      belowMinWeight: boolean;
    }>;
    drugDiseaseFlags: Array<{
      drugSlug: string;
      drug: string;
      conditionSlug: string | null;
      condition: string;
      severity: 'contraindicated' | 'caution';
      mechanism: string;
      recommendation: string;
      references: Citation[];
    }>;
    allergyFlags: Array<{
      allergy: string;
      drugSlug: string;
      drug: string;
      direct: boolean;
      allergen: string;
      crossReactsWith?: string;
      risk: CrossReactivityRisk;
      mechanism?: string;
      recommendation: string;
      references: Citation[];
    }>;
    unknownSlugs: string[];
    summary: {
      drugs: number;
      interactions: number;
      majorInteractions: number;
      contraindicatedInteractions: number;
      watchReserve: number;
      duplicateClasses: number;
      pregnancyContraindicated: number;
      renalProhibited: number;
      paediatricUncapped: number;
      drugDiseaseContraindicated: number;
      allergyHighRisk: number;
    };
  } {
    const { interactions, unknownSlugs } = this.checkInteractions(slugs);
    const unique = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const resolved = unique.map((s) => this.bySlug.get(s)).filter((d): d is DrugRecord => !!d);

    const stewardship = resolved
      .filter((d) => d.awareCategory === 'Watch' || d.awareCategory === 'Reserve')
      .map((d) => ({ slug: d.slug, inn: d.inn, awareCategory: d.awareCategory! }));

    const byClass = new Map<string, DrugRecord[]>();
    for (const d of resolved) {
      if (!d.drugClass) continue;
      const key = d.drugClass.toLowerCase();
      const g = byClass.get(key);
      if (g) g.push(d);
      else byClass.set(key, [d]);
    }
    const duplicateTherapy = [...byClass.values()]
      .filter((g) => g.length > 1)
      .map((g) => ({ drugClass: g[0].drugClass, slugs: g.map((d) => d.slug) }));

    // Pregnancy safety — surface drugs flagged broadly contraindicated in
    // pregnancy. The structured `contraindicated` flag is authoritative;
    // trimester-specific nuance stays in the narrative notes.
    const pregnancyContraindications = resolved
      .filter((d) => d.pregnancy?.contraindicated)
      .map((d) => ({
        slug: d.slug,
        inn: d.inn,
        category: d.pregnancy.category,
        notes: d.pregnancy.notes,
      }));

    // Renal flags — only when a CrCl is supplied. Reuses the same band-match
    // the dosing calculator uses, so the two never disagree. A `prohibited`
    // band is a hard contraindication at this renal function; a non-prohibited
    // match is a dose-adjustment advisory.
    const renalFlags =
      crClMlMin === undefined
        ? []
        : resolved
            .map((d) => ({ d, band: matchRenal(d.dosing?.renal, crClMlMin) }))
            .filter((x): x is { d: DrugRecord; band: NonNullable<typeof x.band> } => !!x.band)
            .map(({ d, band }) => ({
              slug: d.slug,
              inn: d.inn,
              crClMlMin,
              prohibited: !!band.prohibited,
              adjustment: band.adjustment,
            }));

    // Hepatic guidance — no lab input to match against, so surface the
    // record's hepatic note for any drug that carries one (informational).
    const hepaticGuidance = resolved
      .filter((d) => d.dosing?.hepatic)
      .map((d) => ({ slug: d.slug, inn: d.inn, guidance: d.dosing.hepatic! }));

    // Paediatric weight-based dosing — only when a child weight is supplied
    // (< PAEDIATRIC_MAX_WEIGHT_KG, mirroring the dosing calculator's adult
    // threshold). Reuses calculateDose() so the per-kg maths and caps match
    // the dose endpoint exactly. `uncapped` flags drugs with no absolute
    // single-dose ceiling — an overdose risk at higher weights that warrants
    // senior review; `belowMinWeight` flags doses below the validated range.
    const paediatricDosing =
      weightKg === undefined || weightKg <= 0 || weightKg >= PAEDIATRIC_MAX_WEIGHT_KG
        ? []
        : resolved
            .filter((d) => (d.dosing?.paediatric?.mgPerKgPerDose ?? 0) > 0)
            .map((d) => {
              const result = calculateDose(d, { weightKg });
              const cd = result.calculatedDose;
              if (!cd || result.protocol !== 'paediatric') return null;
              const paed = d.dosing.paediatric!;
              return {
                slug: d.slug,
                inn: d.inn,
                mgPerDose: cd.mgPerDose,
                maxMgPerDay: cd.maxMgPerDay,
                route: cd.route,
                frequency: cd.frequency,
                uncapped: paed.maxMgPerDose === undefined,
                belowMinWeight: paed.minWeightKg !== undefined && weightKg < paed.minWeightKg,
              };
            })
            .filter((x): x is NonNullable<typeof x> => !!x);

    // Drug-disease contraindications — only when the patient's conditions are
    // supplied. A record fires when its conditionSlug is among the patient's
    // conditions AND it targets a drug on the list (by slug) or that drug's
    // class. Deterministic; pulled straight from the signed drug-disease set.
    const conditionSet = new Set(
      (conditions ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean),
    );
    const medClasses = new Set(
      resolved.map((d) => d.drugClass?.toLowerCase()).filter((c): c is string => !!c),
    );
    const drugDiseaseFlags =
      conditionSet.size === 0
        ? []
        : this.drugDiseaseInteractions
            .filter((r) => {
              if (!r.conditionSlug || !conditionSet.has(r.conditionSlug.toLowerCase())) {
                return false;
              }
              const drugMatch = unique.includes(r.drugSlug?.toLowerCase());
              const classMatch = !!r.drugClass && medClasses.has(r.drugClass.toLowerCase());
              return drugMatch || classMatch;
            })
            .map((r) => ({
              drugSlug: r.drugSlug,
              drug: r.drug,
              conditionSlug: r.conditionSlug ?? null,
              condition: r.condition,
              severity: r.severity,
              mechanism: r.mechanism,
              recommendation: r.recommendation,
              references: r.references,
            }));

    // Allergy safety — only when the patient's allergies are supplied. Two
    // kinds of flag: (a) a DIRECT allergy — a listed drug is itself the
    // allergen class the patient reacts to; (b) CROSS-REACTIVITY — a listed
    // drug is a known cross-reactant of something the patient is allergic to.
    // The cross-reactant match uses the record's `crossReactsWith` text so we
    // don't misattribute an allergen-side member (flat drugSlugs mixes both).
    const allergyTokens = [...new Set((allergies ?? []).map(normAllergy).filter(Boolean))];
    const allergyFlags: Array<{
      allergy: string;
      drugSlug: string;
      drug: string;
      direct: boolean;
      allergen: string;
      crossReactsWith?: string;
      risk: CrossReactivityRisk;
      mechanism?: string;
      recommendation: string;
      references: Citation[];
    }> = [];
    if (allergyTokens.length > 0) {
      const seen = new Set<string>();
      const push = (f: (typeof allergyFlags)[number]) => {
        const key = `${f.allergy}|${f.drugSlug}|${f.crossReactsWith ?? 'direct'}`;
        if (seen.has(key)) return;
        seen.add(key);
        allergyFlags.push(f);
      };
      for (const token of allergyTokens) {
        for (const d of resolved) {
          const identifiers = [d.slug, d.inn, d.drugClass].map(normAllergy);
          // (a) direct allergy: the drug itself matches the allergy token.
          if (identifiers.some((id) => id && (id.includes(token) || token.includes(id)))) {
            push({
              allergy: token,
              drugSlug: d.slug,
              drug: d.inn,
              direct: true,
              allergen: d.drugClass || d.inn,
              risk: 'high',
              recommendation: `Reported allergy matches ${d.inn} directly — do not administer without allergy verification.`,
              references: [],
            });
          }
          // (b) cross-reactivity via the curated records.
          for (const r of this.allergyCrossReactivity) {
            const allergenMatch =
              tokenMatchesText(token, r.allergen) || r.drugSlugs?.includes(token);
            if (!allergenMatch) continue;
            const crossText = normAllergy(r.crossReactsWith);
            const dClass = normAllergy(d.drugClass);
            const dInn = normAllergy(d.inn);
            const medIsCrossReactant =
              (!!dClass && crossText.includes(dClass)) || (!!dInn && crossText.includes(dInn));
            if (!medIsCrossReactant) continue;
            push({
              allergy: token,
              drugSlug: d.slug,
              drug: d.inn,
              direct: false,
              allergen: r.allergen,
              crossReactsWith: r.crossReactsWith,
              risk: r.risk,
              mechanism: r.mechanism,
              recommendation: r.recommendation,
              references: r.references,
            });
          }
        }
      }
      allergyFlags.sort((a, b) => ALLERGY_RISK_RANK[a.risk] - ALLERGY_RISK_RANK[b.risk]);
    }

    return {
      interactions,
      stewardship,
      duplicateTherapy,
      pregnancyContraindications,
      renalFlags,
      hepaticGuidance,
      paediatricDosing,
      drugDiseaseFlags,
      allergyFlags,
      unknownSlugs,
      summary: {
        drugs: unique.length,
        interactions: interactions.length,
        majorInteractions: interactions.filter(
          (i) =>
            i.severity === 'contraindicated' || i.severity === 'severe' || i.severity === 'major',
        ).length,
        contraindicatedInteractions: interactions.filter((i) => i.severity === 'contraindicated')
          .length,
        watchReserve: stewardship.length,
        duplicateClasses: duplicateTherapy.length,
        pregnancyContraindicated: pregnancyContraindications.length,
        renalProhibited: renalFlags.filter((r) => r.prohibited).length,
        paediatricUncapped: paediatricDosing.filter((p) => p.uncapped).length,
        drugDiseaseContraindicated: drugDiseaseFlags.filter((f) => f.severity === 'contraindicated')
          .length,
        allergyHighRisk: allergyFlags.filter((f) => f.direct || f.risk === 'high').length,
      },
    };
  }

  /** True when the slug appears in at least one interaction record. */
  private slugHasInteractions(slug: string): boolean {
    for (const key of this.interactionsByPair.keys()) {
      const [a, b] = key.split('::');
      if (a === slug || b === slug) return true;
    }
    return false;
  }
}

/** Weight at/above which the dosing calculator treats a patient as an adult. */
const PAEDIATRIC_MAX_WEIGHT_KG = 50;

const ALLERGY_RISK_RANK: Record<CrossReactivityRisk, number> = {
  high: 0,
  moderate: 1,
  low: 2,
  negligible: 3,
};

/** Normalise an allergy / drug identifier for loose matching. */
function normAllergy(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when an allergy token and a free-text class label share a meaningful
 * word (≥ 4 chars) — e.g. "penicillin" ↔ "Penicillins". Avoids matching on
 * short/common fragments.
 */
function tokenMatchesText(token: string, text: string): boolean {
  const t = normAllergy(text);
  if (!t || !token) return false;
  if (t.includes(token) || token.includes(t)) return true;
  const words = t.split(' ').filter((w) => w.length >= 4);
  const tokenWords = token.split(' ').filter((w) => w.length >= 4);
  return tokenWords.some((tw) => words.some((w) => w.includes(tw) || tw.includes(w)));
}

function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
}
