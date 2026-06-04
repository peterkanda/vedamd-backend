import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { AgenticClinicalContext, RetrievedKnowledge } from './agentic.types';

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
@Injectable()
export class KnowledgeRetrieverService {
  constructor(private readonly knowledge: KnowledgeService) {}

  /**
   * Pass-through to KnowledgeService.getCitationStrength — exposed here
   * so callers (AgenticService, ReferenceChatService) can resolve a
   * source-strength tier for each LLM-emitted citation without taking
   * their own dependency on KnowledgeService.
   */
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
    // Lowercased haystack for whole-name drug mentions anywhere in the thread.
    const textHay = `${ctx.question ?? ''} ${conversationText}`.toLowerCase();

    // --- Conditions: match by slug / title / codings + token overlap.
    //     Computed FIRST so a disease-phrased query can also pull in the
    //     drugs that TREAT the matched condition (see indication pass). ---
    const scoredConditions = this.knowledge
      .getConditions()
      .map((c) => ({ rec: c, score: conditionScore(c, dxTerms, freeTokens) }))
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
    const drugs: Array<{ slug: string; inn: string; summary: string }> = [];
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
      const namedHit =
        !structuredHit &&
        [d.slug, d.inn, ...(d.tradeNames ?? [])]
          .map((s) => s?.toLowerCase())
          .some((h) => h && h.length > 3 && textHay.includes(h));
      if (!structuredHit && !namedHit) continue;
      matchedDrugSlugs.add(d.slug);
      drugs.push({ slug: d.slug, inn: d.inn, summary: drugSummary(d) });
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
        drugs.push({ slug: d.slug, inn: d.inn, summary: drugSummary(d) });
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
    }));

    // --- Procedures: token overlap with question + diagnoses ---
    const procedures = this.knowledge
      .getProcedures()
      .map((p) => ({
        rec: p,
        score: tokenOverlap([p.slug, p.title, ...(p.domains ?? [])].join(' '), freeTokens),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.procedures)
      .map((x) => ({ slug: x.rec.slug, title: x.rec.title, summary: procedureSummary(x.rec) }));

    // --- Rules: token overlap with hook + question + diagnoses ---
    const ruleHay = freeTokens.concat(tokenize(ctx.hook ?? ''));
    const rules = this.knowledge
      .getCdsRules()
      .map((r) => ({
        rec: r,
        score: tokenOverlap([r.id, r.title, r.description ?? ''].join(' '), ruleHay),
      }))
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
    .filter((t) => t.length > 3);
}

function tokenOverlap(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = text.toLowerCase();
  return tokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
}

function conditionScore(
  c: { slug: string; title: string; icd10?: string[]; snomed?: string[] },
  dxTerms: string[],
  freeTokens: string[],
): number {
  let score = 0;
  const hay = [c.slug, c.title].map((s) => s.toLowerCase());
  for (const t of dxTerms) {
    if (hay.some((h) => h === t || h.includes(t) || t.includes(h))) score += 5;
    if ((c.icd10 ?? []).some((code) => code.toLowerCase() === t)) score += 5;
    if ((c.snomed ?? []).some((code) => code === t)) score += 5;
  }
  score += tokenOverlap([c.slug, c.title].join(' '), freeTokens);
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
