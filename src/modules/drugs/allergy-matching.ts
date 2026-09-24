import type { Citation } from '../../common/citation';
import type { AllergyCrossReactivity, CrossReactivityRisk } from '../allergy/allergy.types';
import type { DrugRecord } from './drugs.types';

export type AllergyMatchType = 'direct-drug-match' | 'cross-reactive';

export interface DrugAllergyFlag {
  drugSlug: string;
  drug: string;
  allergen: string;
  matchType: AllergyMatchType;
  risk: CrossReactivityRisk;
  recommendation: string;
  mechanism: string;
  references: Citation[];
}

/**
 * Minimum length for an allergen word to be considered at all. Guards
 * against a one- or two-character allergen string matching half the
 * registry: naive substring containment let `"e"` match 112 of 120
 * cross-reactivity records (84 distinct drugs), and a flood of spurious
 * critical allergy cards is its own safety hazard — it trains clinicians
 * to dismiss the alerts that matter.
 */
const MIN_WORD_LEN = 3;

/**
 * Minimum length before an allergen word may match a registry word by
 * prefix. Lets `"sulfa"` reach "sulfamethoxazole" without letting short
 * fragments run wild.
 */
const MIN_PREFIX_LEN = 4;

/**
 * Salt, form and packaging words that name no molecule. Matching on them
 * made a "morphine sulphate" allergy raise a critical "do not give magnesium
 * sulphate" and "sodium valproate" flag normal saline.
 */
const NON_MOLECULE_WORDS = new Set([
  'sulphate',
  'sulfate',
  'hydrochloride',
  'hcl',
  'sodium',
  'potassium',
  'calcium',
  'magnesium',
  'phosphate',
  'acetate',
  'citrate',
  'maleate',
  'tartrate',
  'succinate',
  'fumarate',
  'mesylate',
  'besylate',
  'bromide',
  'chloride',
  'nitrate',
  'lactate',
  'gluconate',
  'carbonate',
  'hydrate',
  'monohydrate',
  'dihydrate',
  'trihydrate',
  'salt',
  'tablet',
  'tablets',
  'tab',
  'tabs',
  'capsule',
  'capsules',
  'cap',
  'caps',
  'injection',
  'syrup',
  'suspension',
  'solution',
  'cream',
  'ointment',
  'oral',
  'drops',
  'mg',
  'mcg',
  'dose',
  'doses',
  'allergy',
  'allergic',
  'reaction',
  'intolerance',
]);

function moleculeWords(allergen: string): string[] {
  const all = words(allergen).filter((w) => w.length >= MIN_WORD_LEN);
  const specific = all.filter((w) => !NON_MOLECULE_WORDS.has(w));
  return specific.length > 0 ? specific : all;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Whole-word comparison, tolerating a single trailing plural 's' so
 * "penicillin" matches a registry entry titled "Penicillins".
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length > 3 && b === `${a}s`) return true;
  if (b.length > 3 && a === `${b}s`) return true;
  return false;
}

/**
 * Does a patient-declared allergen refer to this registry text?
 *
 * Word-level, never substring: substring containment matched
 * "ace" against NSAID-ex·ace·rbated and "pen" against thrombocyto·pen·ia,
 * firing allergy alerts on drugs the patient has no stated allergy to.
 * Prefix matching is deliberately one-directional (registry word starts
 * with the allergen word, never the reverse) — the reverse direction let
 * a stray one-letter registry token such as the "s" in "Cow's milk" or
 * the "e" in "e.g." match almost any allergen.
 */
function allergenMatchesText(allergenWords: string[], text: string): boolean {
  const textWords = words(text);
  return allergenWords.some((a) =>
    textWords.some((t) => sameWord(a, t) || (a.length >= MIN_PREFIX_LEN && t.startsWith(a))),
  );
}

/**
 * Match a patient's declared allergens against a proposed drug list.
 *
 * Two independent passes, both deterministic, no LLM:
 *   1. Direct — the allergen names the drug itself (whole string, or a
 *      whole word of a free-text entry like "amoxicillin rash"). Catches
 *      drugs with no cross-reactivity bundle entry at all (e.g. a patient
 *      allergic to "metformin").
 *   2. Cross-reactive — via the AllergyCrossReactivity registry: the
 *      allergen matches a record's `allergen` text (or one of its
 *      `drugSlugs`), and any drug in that same record's `drugSlugs`
 *      that is on the proposed list is flagged (e.g. penicillin allergy +
 *      amoxicillin/ceftriaxone order).
 *
 * Shared by DrugsService.safetyReview() and the CDS medication-prescribe
 * strategy so the two surfaces can never disagree.
 */
export function matchDrugAllergies(
  resolved: DrugRecord[],
  allergens: string[],
  allergyRecords: AllergyCrossReactivity[],
): DrugAllergyFlag[] {
  const normalized = [...new Set(allergens.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0 || resolved.length === 0) return [];

  // Pre-tokenize once: each declared allergen with its significant words.
  const parsed = normalized.map((allergen) => ({
    allergen,
    // A declared allergen that is *only* a salt word ("magnesium") still has
    // to match something, so fall back to its full word list in that case.
    words: moleculeWords(allergen),
  }));

  const flags: DrugAllergyFlag[] = [];
  const seen = new Set<string>();

  for (const d of resolved) {
    const names = [d.slug, d.inn, ...(d.tradeNames ?? [])]
      .filter(Boolean)
      .map((n) => n.toLowerCase());
    // Only the drug's own identifiers are matched by whole word, so a
    // free-text entry ("amoxicillin rash") still resolves, while a generic
    // word in a multi-word product name can't drag in an unrelated drug.
    const nameWords = new Set([d.slug, d.inn].filter(Boolean).flatMap((n) => words(n)));
    for (const { allergen, words: allergenWords } of parsed) {
      const direct =
        names.includes(allergen) ||
        allergenWords.some((w) => [...nameWords].some((n) => sameWord(w, n)));
      if (!direct) continue;
      const key = `${d.slug}::${allergen}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        drugSlug: d.slug,
        drug: d.inn,
        allergen,
        matchType: 'direct-drug-match',
        risk: 'high',
        recommendation: `Patient-declared allergen "${allergen}" matches this drug directly — do not administer.`,
        mechanism: '',
        references: [],
      });
    }
  }

  const resolvedBySlug = new Map(resolved.map((d) => [d.slug.toLowerCase(), d]));

  for (const rec of allergyRecords) {
    const recSlugsLower = rec.drugSlugs.map((s) => s.toLowerCase());
    const matchedAllergen = parsed.find(
      ({ allergen, words: allergenWords }) =>
        recSlugsLower.includes(allergen) || allergenMatchesText(allergenWords, rec.allergen),
    )?.allergen;
    if (!matchedAllergen) continue;

    for (const slug of recSlugsLower) {
      const d = resolvedBySlug.get(slug);
      if (!d) continue;
      const key = `${d.slug}::${matchedAllergen}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        drugSlug: d.slug,
        drug: d.inn,
        allergen: rec.allergen,
        matchType: 'cross-reactive',
        risk: rec.risk,
        recommendation: rec.recommendation,
        mechanism: rec.mechanism,
        references: rec.references,
      });
    }
  }

  return flags;
}
