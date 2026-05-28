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

  retrieve(ctx: AgenticClinicalContext, caps = { drugs: 25, ddis: 40, conditions: 20, procedures: 10, rules: 15 }): RetrievedKnowledge {
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

    // --- Drugs: match by slug / inn / trade / class against med + allergy terms,
    //     OR by a drug name explicitly mentioned in the question / conversation. ---
    const matchedDrugSlugs = new Set<string>();
    const drugs = this.knowledge
      .getDrugs()
      .filter((d) => {
        const hay = [d.slug, d.inn, d.drugClass, ...(d.tradeNames ?? [])].map((s) => s?.toLowerCase());
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
        const hit = structuredHit || namedHit;
        if (hit) matchedDrugSlugs.add(d.slug);
        return hit;
      })
      .slice(0, caps.drugs)
      .map((d) => ({
        slug: d.slug,
        inn: d.inn,
        summary: drugSummary(d),
      }));

    // --- DDIs: any interaction touching a matched drug slug ---
    const interactions = this.knowledge
      .getInteractions()
      .filter((i) => matchedDrugSlugs.has(i.slugA) || matchedDrugSlugs.has(i.slugB) || medTerms.includes(i.slugA) || medTerms.includes(i.slugB))
      .slice(0, caps.ddis)
      .map((i) => ({
        slugA: i.slugA,
        slugB: i.slugB,
        severity: i.severity,
        mechanism: i.mechanism,
        management: i.management,
      }));

    // --- Conditions: match by slug / title / codings + token overlap ---
    const conditions = this.knowledge
      .getConditions()
      .map((c) => ({ rec: c, score: conditionScore(c, dxTerms, freeTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.conditions)
      .map((x) => ({
        slug: x.rec.slug,
        title: x.rec.title,
        summary: conditionSummary(x.rec),
      }));

    // --- Procedures: token overlap with question + diagnoses ---
    const procedures = this.knowledge
      .getProcedures()
      .map((p) => ({ rec: p, score: tokenOverlap([p.slug, p.title, ...(p.domains ?? [])].join(' '), freeTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.procedures)
      .map((x) => ({ slug: x.rec.slug, title: x.rec.title, summary: procedureSummary(x.rec) }));

    // --- Rules: token overlap with hook + question + diagnoses ---
    const ruleHay = freeTokens.concat(tokenize(ctx.hook ?? ''));
    const rules = this.knowledge
      .getCdsRules()
      .map((r) => ({ rec: r, score: tokenOverlap([r.id, r.title, r.description ?? ''].join(' '), ruleHay) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, caps.rules)
      .map((x) => ({ id: x.rec.id, title: x.rec.title, description: x.rec.description ?? '' }));

    return { drugs, interactions, conditions, procedures, rules };
  }
}

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
  pregnancy?: { contraindicated?: boolean; notes?: string };
  renal?: unknown[];
  warnings?: string[];
}): string {
  const parts = [`class=${d.drugClass}`];
  if (d.awareCategory) parts.push(`AWaRe=${d.awareCategory}`);
  if (d.pregnancy?.contraindicated) parts.push('PREGNANCY-CONTRAINDICATED');
  else if (d.pregnancy?.notes) parts.push(`pregnancy: ${truncate(d.pregnancy.notes, 120)}`);
  if (Array.isArray(d.renal) && d.renal.length) parts.push('has renal-dose-adjustment');
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

function procedureSummary(p: {
  domains?: string[];
  redFlags?: string[];
}): string {
  const parts: string[] = [];
  if (p.domains?.length) parts.push(`domains: ${p.domains.join(',')}`);
  if (p.redFlags?.length) parts.push(`red flags: ${truncate(p.redFlags.join('; '), 200)}`);
  return parts.join(' | ');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
