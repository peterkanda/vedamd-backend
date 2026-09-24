import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { calculateDose, isUncappedPaediatricDose, matchRenal } from './drugs.dosing';
import { normalizeDrugRecords } from './drug-record-normalize';
import { matchDrugAllergies, type DrugAllergyFlag } from './allergy-matching';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AllergyService } from '../allergy/allergy.service';
import type { DrugDiseaseInteraction } from '../drug-disease/drug-disease.types';
import type { Citation } from '../../common/citation';
import type {
  AwareCategory,
  DosingInput,
  DosingResult,
  DrugInteraction,
  DrugRecord,
  DrugSummary,
  ManufacturerLabel,
  PpbSmpcLink,
} from './drugs.types';

/** Non-exhaustiveness caveat attached to every interaction-check response —
 *  a database check against the current registry, not a clinical guarantee. */
const INTERACTION_CAVEAT =
  'This reflects the current VedaMD drug-interaction registry, not an exhaustive clinical ' +
  'check — the absence of a listed interaction is not a guarantee that no interaction exists. ' +
  'Verify against a current formulary for any agent not covered here.';

/** Shown with every manufacturer-label response — labels are references, not VedaMD guidance. */
const LABEL_NOTICE =
  'Manufacturer labels are reference-only regulator documents for the stated jurisdiction. ' +
  'US labels describe US products; strengths, formulations and approved uses can differ from ' +
  'products registered in Kenya. VedaMD guidance on this drug takes precedence at the point of care.';

export interface DrugLabelsResponse {
  slug: string;
  notice: string;
  labels: ManufacturerLabel[];
  /** Link-only pointers to Kenya PPB SmPC PDFs (no text is stored). */
  ppbSmpcLinks: PpbSmpcLink[];
}

export interface ListFilters {
  q?: string;
  atc?: string;
  aware?: AwareCategory;
  kemlOnly?: boolean;
}

@Injectable()
export class DrugsService implements OnModuleInit {
  private readonly logger = new Logger(DrugsService.name);
  private bySlug = new Map<string, DrugRecord>();
  private aliasGroups = new Map<string, string[]>();
  private interactionsByPair = new Map<string, DrugInteraction>();
  private drugDiseaseInteractions: DrugDiseaseInteraction[] = [];

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly allergy?: AllergyService,
  ) {}

  onModuleInit(): void {
    // Clinical consumers (dosing, renal / pregnancy rules, safety review) read
    // normalised copies; the knowledge service keeps the records exactly as
    // signed, because governance hashes them (see normalizeDrugRecords).
    const drugs = this.knowledge.getDrugs().map((d) => structuredClone(d));
    const issues = normalizeDrugRecords(drugs);
    if (issues.length) {
      this.logger.warn(
        `Normalised ${issues.length} drug record shape(s) that would have disabled safety rules; ` +
          `fix in content: ${issues.slice(0, 10).join('; ')}${issues.length > 10 ? '; …' : ''}`,
      );
    }
    this.bySlug = new Map(drugs.map((d) => [d.slug, d]));
    this.aliasGroups = buildAliasGroups([
      ...drugs.map((d) => d.slug),
      ...this.knowledge.getInteractions().flatMap((i) => [i.slugA, i.slugB]),
    ]);
    this.interactionsByPair = new Map(
      this.knowledge.getInteractions().map((i) => [pairKey(i.slugA, i.slugB), i]),
    );
    this.drugDiseaseInteractions = this.knowledge.getDrugDiseaseInteractions() ?? [];
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

  /**
   * Manufacturer labels + PPB SmPC links for a drug, or null for an unknown
   * slug. In approved-only mode (CONTENT_REQUIRE_APPROVED) anything not
   * explicitly approved — labels and PPB links alike — is withheld, matching
   * the rest of the bundle.
   */
  getLabels(slug: string): DrugLabelsResponse | null {
    if (!this.bySlug.has(slug)) return null;
    const approvedOnly = this.knowledge.requiresApproved();
    const labels = (this.knowledge.getManufacturerLabels() ?? []).filter(
      (l) => l.slug === slug && (!approvedOnly || l.reviewStatus === 'approved'),
    );
    const ppbSmpcLinks = (this.knowledge.getPpbSmpcLinks() ?? []).filter(
      (l) => l.slug === slug && (!approvedOnly || l.reviewStatus === 'approved'),
    );
    return { slug, notice: LABEL_NOTICE, labels, ppbSmpcLinks };
  }

  calculateDose(slug: string, input: DosingInput): DosingResult | null {
    const drug = this.bySlug.get(slug);
    if (!drug) return null;
    return calculateDose(drug, input);
  }

  /** Every slug the bundle files this molecule under (including itself). */
  aliasesOf(slug: string): string[] {
    const s = slug.trim().toLowerCase();
    return this.aliasGroups.get(s) ?? [s];
  }

  checkInteractions(slugs: string[]): {
    interactions: DrugInteraction[];
    unknownSlugs: string[];
    /** Always present: an empty `interactions` array reflects the current
     *  registry content, not a guarantee that no interaction exists — this
     *  is a bounded database check, not exhaustive clinical verification. */
    caveat: string;
  } {
    const unique = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    // `unknownSlugs` flags slugs with no monograph AND no interaction record,
    // but the pair scan runs over ALL supplied slugs: some interaction records
    // reference agents that have no monograph yet (e.g. dipyridamole, ethanol),
    // and filtering those out before the scan silently suppressed reviewed
    // interactions — a false "no known interactions" on a flagged combination.
    const unknown = unique.filter((s) => !this.bySlug.has(s) && !this.slugHasInteractions(s));

    // Each slug stands for its whole molecule group: the bundle holds
    // duplicate records for 59 molecules (co-trimoxazole / cotrimoxazole,
    // X / X-detail …) with interactions filed under only one of them, so
    // warfarin + "co-trimoxazole" used to find nothing.
    const found: DrugInteraction[] = [];
    const seen = new Set<DrugInteraction>();
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const groupA = this.aliasesOf(unique[i]);
        const groupB = this.aliasesOf(unique[j]);
        if (groupA.some((a) => groupB.includes(a))) continue; // same molecule
        for (const a of groupA) {
          for (const b of groupB) {
            const hit = this.interactionsByPair.get(pairKey(a, b));
            if (hit && !seen.has(hit)) {
              seen.add(hit);
              found.push(hit);
            }
          }
        }
      }
    }

    return { interactions: found, unknownSlugs: unknown, caveat: INTERACTION_CAVEAT };
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
    patientAllergies?: string[],
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
      caution: boolean;
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
    allergyFlags: DrugAllergyFlag[];
    unknownSlugs: string[];
    /** Same non-exhaustiveness caveat as checkInteractions(). */
    caveat: string;
    summary: {
      drugs: number;
      interactions: number;
      majorInteractions: number;
      watchReserve: number;
      duplicateClasses: number;
      pregnancyContraindicated: number;
      renalProhibited: number;
      paediatricUncapped: number;
      drugDiseaseContraindicated: number;
      allergyContraindicated: number;
    };
  } {
    const { interactions, unknownSlugs, caveat } = this.checkInteractions(slugs);
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
              caution: !!band.caution,
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
                uncapped: isUncappedPaediatricDose(paed),
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

    // Allergy / cross-reactivity — only when the patient's declared allergens
    // are supplied. Reuses the same matcher the CDS medication-prescribe
    // strategy calls, so the REST panel and the hook can never disagree.
    const allergyFlags =
      patientAllergies?.length && this.allergy
        ? matchDrugAllergies(resolved, patientAllergies, this.allergy.allFull())
        : [];

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
      caveat,
      summary: {
        drugs: unique.length,
        interactions: interactions.length,
        majorInteractions: interactions.filter(
          (i) =>
            i.severity === 'contraindicated' || i.severity === 'severe' || i.severity === 'major',
        ).length,
        watchReserve: stewardship.length,
        duplicateClasses: duplicateTherapy.length,
        pregnancyContraindicated: pregnancyContraindications.length,
        renalProhibited: renalFlags.filter((r) => r.prohibited).length,
        paediatricUncapped: paediatricDosing.filter((p) => p.uncapped).length,
        drugDiseaseContraindicated: drugDiseaseFlags.filter((f) => f.severity === 'contraindicated')
          .length,
        allergyContraindicated: allergyFlags.filter(
          (f) => f.risk === 'high' || f.risk === 'moderate',
        ).length,
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

/**
 * Records that are the same molecule under different slugs. Grouped by the
 * slug's letters (so "co-trimoxazole" meets "cotrimoxazole") with a "-detail"
 * suffix dropped, plus pairs whose slugs share nothing. Not by INN: one
 * record's INN field is wrong (a noradrenaline combination lists "esmolol").
 */
const SAME_MOLECULE: string[][] = [
  ['amoxicillin-clavulanate', 'co-amoxiclav'],
  ['glyceryl-trinitrate', 'gtn'],
  ['aciclovir', 'acyclovir'],
  ['tenofovir-disoproxil', 'tenofovir-disoproxil-fumarate'],
  ['timolol-eye-drops', 'timolol-ophthalmic'],
  ['furosemide', 'frusemide'],
  ['rifampicin', 'rifampin'],
  ['magnesium-sulphate', 'magnesium-sulfate'],
];

function buildAliasGroups(slugs: string[]): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  const keyOf = (slug: string) =>
    slug
      .toLowerCase()
      .replace(/-detail$/, '')
      .replace(/[^a-z0-9]/g, '');
  for (const slug of new Set(slugs.map((s) => s.toLowerCase()))) {
    const k = keyOf(slug);
    if (!byKey.has(k)) byKey.set(k, new Set());
    byKey.get(k)!.add(slug);
  }
  for (const pair of SAME_MOLECULE) {
    const merged = new Set(pair.flatMap((s) => [...(byKey.get(keyOf(s)) ?? [s])]));
    for (const s of pair) byKey.set(keyOf(s), merged);
  }
  const out = new Map<string, string[]>();
  for (const group of byKey.values()) {
    const list = [...group];
    for (const s of list) out.set(s, list);
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
}
