import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { AgenticClinicalContext, RetrievedKnowledge } from './agentic.types';
import { questionTopics, type PlacedRecord } from '../knowledge/grounding/coverage';
import { summarizeRecord } from '../knowledge/grounding/record-summary';

/**
 * Knowledge retriever — selects the records from the 974-record signed
 * bundle that are relevant to the inbound clinical context, so the
 * agentic LLM reasons over GROUND TRUTH rather than its training data.
 *
 * Retrieval is keyword + token overlap (no external embedding service,
 * keeping the engine self-contained + stateless). Matches on:
 *   - medication slugs / INN / trade names / drug class
 *   - condition slugs / titles / ICD / SNOMED
 *   - all DDIs touching any mentioned medication
 *   - procedures + rules with token overlap
 *
 * The retrieved set is capped so the prompt stays bounded; the most
 * specific matches (exact slug) are always included first.
 */

/** Per-record grounding budgets for the agentic and reference prompts. */
const DRUG_GROUNDING_CHARS = 1100;
const CONDITION_GROUNDING_CHARS = 900;
@Injectable()
export class KnowledgeRetrieverService implements OnApplicationBootstrap {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** Build the per-bundle match indexes now, not on the first chat. */
  onApplicationBootstrap(): void {
    try {
      this.retrieve({});
    } catch {
      // No bundle loaded — the indexes are built on first use instead.
    }
  }

  /**
   * Pass-through to KnowledgeService.getCitationStrength — exposed here
   * so callers (AgenticService, ReferenceChatService) can resolve a
   * source-strength tier for each LLM-emitted citation without taking
   * their own dependency on KnowledgeService.
   */
  /** Bundle label and review status for a verified citation. */
  describeCitation = (
    kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
    id: string,
  ): { label: string; reviewStatus?: string } | undefined => {
    const rec = this.knowledge.resolveCitedRecord(kind, id);
    return rec && { label: rec.label, reviewStatus: rec.reviewStatus };
  };

  resolveCitationStrength = (
    kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
    id: string,
  ): 'A' | 'B' | 'C' | 'D' | undefined => this.knowledge.getCitationStrength(kind, id);

  totalRecords(): number {
    return (
      this.knowledge.getDrugs().length +
      this.knowledge.getInteractions().length +
      this.knowledge.getConditions().length +
      this.knowledge.getProcedures().length +
      this.knowledge.getCdsRules().length +
      this.knowledge.getClinicalScores().length +
      this.knowledge.getPgxGuidelines().length +
      this.knowledge.getDrugDiseaseInteractions().length +
      this.knowledge.getImmunizationSchedule().length +
      this.knowledge.getAllergyCrossReactivity().length +
      this.knowledge.getNotifiableDiseases().length +
      this.knowledge.getReferenceRanges().length +
      this.knowledge.getAntidotes().length
    );
  }

  /**
   * Each retrieved item as the grounding gate sees it: the full bundle record
   * (to test which question terms it covers) and the text the model is given.
   */
  placedRecords(knowledge: RetrievedKnowledge): PlacedRecord[] {
    const out: PlacedRecord[] = [];
    for (const d of knowledge.drugs) {
      const rec = bySlug(this.knowledge.getDrugs(), d.slug);
      if (rec)
        out.push({
          record: rec as unknown as Record<string, unknown>,
          text: d.grounding ?? d.summary,
        });
    }
    for (const c of knowledge.conditions) {
      const rec = bySlug(this.knowledge.getConditions(), c.slug);
      if (rec)
        out.push({
          record: rec as unknown as Record<string, unknown>,
          text: c.grounding ?? c.summary,
        });
    }
    for (const i of knowledge.interactions) {
      out.push({ record: i as unknown as Record<string, unknown>, text: JSON.stringify(i) });
    }
    for (const p of knowledge.procedures) {
      const rec = bySlug(this.knowledge.getProcedures(), p.slug);
      if (rec) out.push({ record: rec as unknown as Record<string, unknown>, text: p.summary });
    }
    for (const r of knowledge.rules) {
      out.push({ record: r as unknown as Record<string, unknown>, text: JSON.stringify(r) });
    }
    return out;
  }

  retrieve(
    ctx: AgenticClinicalContext,
    caps = { drugs: 25, ddis: 40, conditions: 20, procedures: 10, rules: 15 },
  ): RetrievedKnowledge {
    const medTerms = norm(ctx.medications ?? []);
    const dxTerms = norm(ctx.diagnoses ?? []);
    const allergyTerms = norm(ctx.allergies ?? []);

    // Conversation text widens retrieval for follow-ups. A terse
    // follow-up ("and if after 3 days they don't get better?") carries
    // almost no clinical tokens on its own, so without this the
    // retriever returns nothing and the LLM is left to hallucinate.
    // Folding in the prior turns re-grounds the answer against the
    // drugs / conditions established earlier in the thread.
    const conversationText = (ctx.conversation ?? []).map((m) => m.content).join(' ');
    const freeTokens = tokenize(
      [ctx.question ?? '', conversationText, ...(ctx.diagnoses ?? [])].join(' '),
    );
    // Scoring counts every occurrence of a token, so count each distinct
    // token once and score it with a single index lookup (see substringIndex).
    const freeTokenCounts = countTokens(freeTokens);
    // Lowercased haystack for whole-name drug mentions anywhere in the thread.
    const textHay = `${ctx.question ?? ''} ${conversationText}`.toLowerCase();
    const textWords = new Set(textHay.split(NON_ALNUM));
    // Grounding text for the model: whole fields, the ones the question asks
    // about first. The old one-line summaries cut adult dosing at 320
    // characters and pregnancy at 120, and left out contraindications,
    // lactation and renal values entirely.
    const topics = questionTopics(textHay);
    const ground = (rec: object, domain: 'drugs' | 'conditions') =>
      summarizeRecord(rec as Record<string, unknown>, domain, {
        budget: domain === 'drugs' ? DRUG_GROUNDING_CHARS : CONDITION_GROUNDING_CHARS,
        topics,
      }).text;

    // --- Conditions: match by slug / title / codings + token overlap.
    //     Computed FIRST so a disease-phrased query can also pull in the
    //     drugs that TREAT the matched condition (see indication pass). ---
    const allConditions = this.knowledge.getConditions();
    const conditionOverlap = overlapScores(
      substringIndex(allConditions, (c) => [c.slug, c.title].join(' ')),
      freeTokenCounts,
    );
    const scoredConditions = allConditions
      .map((c, i) => ({ rec: c, score: conditionScore(c, dxTerms) + conditionOverlap[i] }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.conditions);

    // Disease signals drawn from the conditions the QUESTION actually names
    // (a condition-title token that is also present in the free text). These
    // drive the indication-linkage drug pass below, so "prescribe malaria
    // drugs for a 60 kg child" surfaces the antimalarials — WITH their
    // weight-banded dosing — even though no drug was named explicitly.
    const freeTokenSet = new Set(freeTokens);
    const linkIcd10 = new Set<string>();
    const diseaseTokens = new Set<string>();
    for (const { rec } of scoredConditions) {
      const titleTokens = tokenize(rec.title).filter(
        (t) => freeTokenSet.has(t) && !GENERIC_TOKENS.has(t),
      );
      if (titleTokens.length === 0) continue;
      for (const t of titleTokens) diseaseTokens.add(t);
      for (const code of rec.icd10 ?? []) linkIcd10.add(code.toUpperCase());
    }

    // --- Drugs ---
    const matchedDrugSlugs = new Set<string>();
    const drugs: RetrievedKnowledge['drugs'] = [];
    const allDrugs = this.knowledge.getDrugs();

    // Pass 1 — EXPLICIT hits: structured med/allergy terms, or a drug name
    // written into the question / conversation. These always take priority.
    for (const d of allDrugs) {
      if (drugs.length >= caps.drugs) break;
      const hay = [d.slug, d.inn, d.drugClass, ...(d.tradeNames ?? [])].map((s) =>
        s?.toLowerCase(),
      );
      const structuredHit = [...medTerms, ...allergyTerms].some((t) =>
        hay.some((h) => h && (h === t || h.includes(t) || t.includes(h))),
      );
      // Only the specific names (slug/inn/trade) are matched against free
      // text — NOT drugClass, which is too broad and would over-retrieve.
      // Whole words only: substring matching found "revia" (naltrexone) in
      // "abbreviation" and "cipro" in "reciprocal".
      const namedHit =
        !structuredHit && drugNameMatchers(d).some((m) => m.matches(textHay, textWords));
      if (!structuredHit && !namedHit) continue;
      matchedDrugSlugs.add(d.slug);
      drugs.push({
        slug: d.slug,
        inn: d.inn,
        summary: drugSummary(d),
        grounding: ground(d, 'drugs'),
      });
    }

    // Pass 2 — INDICATION linkage: pull the drugs that treat a disease the
    // question named (ICD-10 overlap with a matched condition, or the
    // indication text mentioning the disease). Without this, a request that
    // names a disease/class instead of a specific drug retrieves no drug
    // records, the LLM has no grounded dosing to cite, and the answer is
    // empty.
    if ((linkIcd10.size > 0 || diseaseTokens.size > 0) && drugs.length < caps.drugs) {
      for (const d of allDrugs) {
        if (drugs.length >= caps.drugs) break;
        if (matchedDrugSlugs.has(d.slug)) continue;
        const indicationHit = (d.indications ?? []).some((ind) => {
          if (ind.icd10 && linkIcd10.has(ind.icd10.toUpperCase())) return true;
          const text = ind.text?.toLowerCase() ?? '';
          return [...diseaseTokens].some((t) => text.includes(t));
        });
        if (!indicationHit) continue;
        matchedDrugSlugs.add(d.slug);
        drugs.push({
          slug: d.slug,
          inn: d.inn,
          summary: drugSummary(d),
          grounding: ground(d, 'drugs'),
        });
      }
    }

    // --- DDIs: any interaction touching a matched drug slug ---
    const interactions = this.knowledge
      .getInteractions()
      .filter(
        (i) =>
          matchedDrugSlugs.has(i.slugA) ||
          matchedDrugSlugs.has(i.slugB) ||
          medTerms.includes(i.slugA) ||
          medTerms.includes(i.slugB),
      )
      .slice(0, caps.ddis)
      .map((i) => ({
        slugA: i.slugA,
        slugB: i.slugB,
        severity: i.severity,
        mechanism: i.mechanism,
        management: i.management,
      }));

    const conditions = scoredConditions.map((x) => ({
      slug: x.rec.slug,
      title: x.rec.title,
      summary: conditionSummary(x.rec),
      grounding: ground(x.rec, 'conditions'),
    }));

    // --- Procedures: token overlap with question + diagnoses ---
    const allProcedures = this.knowledge.getProcedures();
    const procedureOverlap = overlapScores(
      substringIndex(allProcedures, (p) => [p.slug, p.title, ...(p.domains ?? [])].join(' ')),
      freeTokenCounts,
    );
    const procedures = allProcedures
      .map((p, i) => ({ rec: p, score: procedureOverlap[i] }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.procedures)
      .map((x) => ({ slug: x.rec.slug, title: x.rec.title, summary: procedureSummary(x.rec) }));

    // --- Rules: token overlap with hook + question + diagnoses ---
    const ruleHay = countTokens(freeTokens.concat(tokenize(ctx.hook ?? '')));
    const allRules = this.knowledge.getCdsRules();
    const ruleOverlap = overlapScores(
      substringIndex(allRules, (r) => [r.id, r.title, r.description ?? ''].join(' ')),
      ruleHay,
    );
    const rules = allRules
      .map((r, i) => ({ rec: r, score: ruleOverlap[i] }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.rules)
      .map((x) => ({ id: x.rec.id, title: x.rec.title, description: x.rec.description ?? '' }));

    return { drugs, interactions, conditions, procedures, rules };
  }
}

/**
 * Condition-title tokens too generic to identify a DISEASE on their own —
 * they describe the population, acuity, or care step. Excluded from the
 * indication-linkage signal so e.g. "adult" or "treatment" in a question
 * doesn't pull in unrelated drugs.
 */
const GENERIC_TOKENS = new Set([
  'adult',
  'adults',
  'child',
  'children',
  'paediatric',
  'pediatric',
  'infant',
  'infants',
  'neonate',
  'neonatal',
  'acute',
  'chronic',
  'severe',
  'uncomplicated',
  'complicated',
  'mild',
  'moderate',
  'management',
  'treatment',
  'therapy',
  'prescribe',
  'patient',
  'patients',
  'disease',
  'syndrome',
  'complete',
  'pathway',
  'policy',
  'first',
  'line',
  'second',
  'dose',
  'dosing',
  'drug',
  'drugs',
  'years',
  'year',
  'female',
  'male',
  'with',
  'without',
  'pre',
]);

function norm(arr: string[]): string[] {
  return arr.map((s) => s.toLowerCase().trim()).filter(Boolean);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

/** Each distinct token with the number of times it occurs. */
function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

/**
 * Every substring of four or more characters of every word in a domain's
 * match text, mapped to the records whose text contains it. Built once per
 * bundle (keyed by the records array).
 *
 * Free-text tokens are runs of four or more letters and digits, so a token
 * occurs in a record's lowercased text exactly when it is a substring of
 * one of that text's alphanumeric words. Scoring is then one lookup per
 * distinct token, instead of a substring search of every record for every
 * token — which grew with the length of the conversation.
 */
interface SubstringIndex {
  records: number;
  postings: Map<string, number[]>;
}
const MIN_TOKEN_LENGTH = 4;
const NON_ALNUM = /[^a-z0-9]+/;
const substringIndexes = new WeakMap<readonly object[], SubstringIndex>();

function substringIndex<T extends object>(
  records: readonly T[],
  text: (rec: T) => string,
): SubstringIndex {
  let index = substringIndexes.get(records);
  if (index) return index;
  const postings = new Map<string, number[]>();
  records.forEach((rec, id) => {
    const subs = new Set<string>();
    for (const word of text(rec).toLowerCase().split(NON_ALNUM)) {
      for (let i = 0; i + MIN_TOKEN_LENGTH <= word.length; i++) {
        for (let j = i + MIN_TOKEN_LENGTH; j <= word.length; j++) subs.add(word.slice(i, j));
      }
    }
    for (const sub of subs) {
      const ids = postings.get(sub);
      if (ids) ids.push(id);
      else postings.set(sub, [id]);
    }
  });
  index = { records: records.length, postings };
  substringIndexes.set(records, index);
  return index;
}

/**
 * Per record, how many of the tokens (counting repeats) occur in its match
 * text — what `tokens.filter((t) => text.includes(t)).length` gives.
 */
function overlapScores(index: SubstringIndex, tokens: ReadonlyMap<string, number>): number[] {
  const scores = new Array<number>(index.records).fill(0);
  for (const [token, n] of tokens) {
    for (const id of index.postings.get(token) ?? []) scores[id] += n;
  }
  return scores;
}

/** First record per slug, as `Array.find` would return it. */
const slugIndexes = new WeakMap<readonly { slug: string }[], Map<string, unknown>>();
function bySlug<T extends { slug: string }>(xs: readonly T[], slug: string): T | undefined {
  let index = slugIndexes.get(xs);
  if (!index) {
    index = new Map();
    for (const x of xs) if (!index.has(x.slug)) index.set(x.slug, x);
    slugIndexes.set(xs, index);
  }
  return index.get(slug) as T | undefined;
}

/** Score from the structured diagnosis terms; free-text overlap is added separately. */
function conditionScore(
  c: { slug: string; title: string; icd10?: string[]; snomed?: string[] },
  dxTerms: string[],
): number {
  let score = 0;
  const hay = [c.slug, c.title].map((s) => s.toLowerCase());
  for (const t of dxTerms) {
    if (hay.some((h) => h === t || h.includes(t) || t.includes(h))) score += 5;
    if ((c.icd10 ?? []).some((code) => code.toLowerCase() === t)) score += 5;
    if ((c.snomed ?? []).some((code) => code === t)) score += 5;
  }
  return score;
}

function drugSummary(d: {
  drugClass: string;
  awareCategory?: string;
  indications?: { icd10?: string; text: string }[];
  dosing?: {
    adult?: { route: string; regimen: string; notes?: string }[];
    paediatric?: {
      mgPerKgPerDose?: number;
      maxMgPerKgPerDay?: number;
      maxMgPerDose?: number;
      minWeightKg?: number;
      route?: string;
      frequency?: string;
      notes?: string;
    };
    renal?: unknown[];
    individualised?: boolean;
  };
  pregnancy?: { contraindicated?: boolean; notes?: string };
  warnings?: string[];
}): string {
  const parts = [`class=${d.drugClass}`];
  if (d.awareCategory) parts.push(`AWaRe=${d.awareCategory}`);
  if (d.indications?.length)
    parts.push(`indications: ${truncate(d.indications.map((i) => i.text).join('; '), 160)}`);
  // Dosing — the actual numbers a prescribing question needs to be
  // answerable. Without these in the prompt, the strictly-grounded
  // reasoner cannot cite a dose and returns nothing.
  const adult = d.dosing?.adult ?? [];
  if (adult.length)
    parts.push(
      `adult dose: ${truncate(
        adult.map((a) => `${a.regimen}${a.notes ? ` (${a.notes})` : ''}`).join(' | '),
        320,
      )}`,
    );
  const paed = d.dosing?.paediatric;
  if (paed) {
    const pbits: string[] = [];
    if (paed.mgPerKgPerDose != null) pbits.push(`${paed.mgPerKgPerDose} mg/kg/dose`);
    if (paed.maxMgPerKgPerDay != null) pbits.push(`max ${paed.maxMgPerKgPerDay} mg/kg/day`);
    if (paed.maxMgPerDose != null) pbits.push(`max ${paed.maxMgPerDose} mg/dose`);
    if (paed.frequency) pbits.push(paed.frequency);
    if (paed.minWeightKg != null) pbits.push(`min weight ${paed.minWeightKg} kg`);
    if (paed.notes) pbits.push(truncate(paed.notes, 220));
    if (pbits.length) parts.push(`paediatric dose: ${pbits.join(', ')}`);
  }
  if (d.dosing?.individualised) parts.push('dosing: individualised (titrate to response)');
  if (Array.isArray(d.dosing?.renal) && d.dosing.renal.length)
    parts.push('has renal-dose-adjustment');
  if (d.pregnancy?.contraindicated) parts.push('PREGNANCY-CONTRAINDICATED');
  else if (d.pregnancy?.notes) parts.push(`pregnancy: ${truncate(d.pregnancy.notes, 120)}`);
  if (d.warnings?.length) parts.push(`warnings: ${truncate(d.warnings.join('; '), 200)}`);
  return parts.join(' | ');
}

function conditionSummary(c: {
  icd10?: string[];
  redFlags?: string[];
  management?: Array<{ step: string; detail: string }>;
}): string {
  const parts: string[] = [];
  if (c.icd10?.length) parts.push(`ICD-10: ${c.icd10.join(',')}`);
  if (c.redFlags?.length) parts.push(`red flags: ${truncate(c.redFlags.join('; '), 200)}`);
  if (c.management?.length) {
    parts.push(
      `management: ${truncate(c.management.map((m) => `${m.step} — ${m.detail}`).join(' || '), 600)}`,
    );
  }
  return parts.join(' | ');
}

function procedureSummary(p: { domains?: string[]; redFlags?: string[] }): string {
  const parts: string[] = [];
  if (p.domains?.length) parts.push(`domains: ${p.domains.join(',')}`);
  if (p.redFlags?.length) parts.push(`red flags: ${truncate(p.redFlags.join('; '), 200)}`);
  return parts.join(' | ');
}

const ALNUM_CHAR = /[a-z0-9]/;

interface NameMatcher {
  matches(haystack: string, words: ReadonlySet<string>): boolean;
}

/**
 * Whole-word (or whole-phrase) occurrence of `needle` in lowercased text:
 * an occurrence with no letter or digit directly before or after it.
 *
 * `words` is the haystack split on runs of non-alphanumerics. Every
 * alphanumeric run inside the needle must be one of those words at a
 * matching occurrence, so a name made only of letters and digits is a
 * set lookup, and any other name is scanned only when all of its runs
 * are present.
 */
function wordMatcher(needle: string): NameMatcher {
  const runs = needle.split(NON_ALNUM).filter(Boolean);
  if (runs.length === 1 && runs[0] === needle) {
    return { matches: (_hay, words) => words.has(needle) };
  }
  return {
    matches: (hay, words) => runs.every((r) => words.has(r)) && containsWord(hay, needle),
  };
}

function containsWord(haystack: string, needle: string): boolean {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    const before = i > 0 && ALNUM_CHAR.test(haystack[i - 1]);
    const after = end < haystack.length && ALNUM_CHAR.test(haystack[end]);
    if (!before && !after) return true;
  }
  return false;
}

/** Name matchers per drug (slug, INN, trade names longer than 3 characters). */
const drugMatcherCache = new WeakMap<object, NameMatcher[]>();
function drugNameMatchers(d: { slug: string; inn: string; tradeNames?: string[] }): NameMatcher[] {
  let matchers = drugMatcherCache.get(d);
  if (!matchers) {
    matchers = [d.slug, d.inn, ...(d.tradeNames ?? [])]
      .map((s) => s?.toLowerCase())
      .filter((h): h is string => !!h && h.length > 3)
      .map(wordMatcher);
    drugMatcherCache.set(d, matchers);
  }
  return matchers;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
