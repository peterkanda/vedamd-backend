import { beforeAll, describe, expect, it } from 'vitest';
import { KnowledgeRetrieverService } from '../src/modules/agentic/knowledge-retriever.service';
import type { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * The retriever scores records through a per-bundle substring index and
 * matches drug names against a word set. Both replaced plain scans that
 * slowed with every conversation turn. These tests re-run the plain scans
 * over the real bundle and require the same records in the same order.
 */

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function naiveOverlap(text: string, tokens: string[]): number {
  const hay = text.toLowerCase();
  return tokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
}

function naiveContainsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
}

function rank<T>(records: T[], score: (r: T) => number, cap: number): T[] {
  return records
    .map((rec) => ({ rec, score: score(rec) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map((x) => x.rec);
}

describe('Retriever — indexed scoring matches a plain scan', () => {
  let knowledge: KnowledgeService;
  let retriever: KnowledgeRetrieverService;
  let longThread: Array<{ role: 'user' | 'assistant'; content: string }>;

  beforeAll(() => {
    knowledge = makeKnowledgeService();
    retriever = new KnowledgeRetrieverService(knowledge);
    // Varied clinical prose, so the token mix is as diverse as a real thread.
    longThread = knowledge
      .getConditions()
      .filter((_, i) => i % 97 === 0)
      .slice(0, 16)
      .map((c, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: JSON.stringify(c).slice(0, 1500),
      }));
  });

  const contexts = () => [
    { question: 'hypertension management in pregnancy' },
    { question: 'what is the abbreviation for reciprocal dosing' },
    { question: 'Augmentin or co-trimoxazole for a child with otitis media?' },
    { question: 'and for a child?', conversation: longThread },
    { question: 'QT risk', hook: 'medication-prescribe', diagnoses: ['pneumonia'] },
  ];

  it('ranks conditions, procedures and rules exactly as before', () => {
    for (const ctx of contexts()) {
      const conversationText = (ctx.conversation ?? []).map((m) => m.content).join(' ');
      const free = tokenize(
        [ctx.question ?? '', conversationText, ...(ctx.diagnoses ?? [])].join(' '),
      );
      const dxTerms = (ctx.diagnoses ?? []).map((d) => d.toLowerCase());
      const got = retriever.retrieve(ctx);

      const conditions = rank(
        knowledge.getConditions(),
        (c) => {
          let score = 0;
          const hay = [c.slug, c.title].map((s) => s.toLowerCase());
          for (const t of dxTerms) {
            if (hay.some((h) => h === t || h.includes(t) || t.includes(h))) score += 5;
            if ((c.icd10 ?? []).some((code) => code.toLowerCase() === t)) score += 5;
            if ((c.snomed ?? []).some((code) => code === t)) score += 5;
          }
          return score + naiveOverlap([c.slug, c.title].join(' '), free);
        },
        20,
      );
      expect(got.conditions.map((c) => c.slug)).toEqual(conditions.map((c) => c.slug));

      const procedures = rank(
        knowledge.getProcedures(),
        (p) => naiveOverlap([p.slug, p.title, ...(p.domains ?? [])].join(' '), free),
        10,
      );
      expect(got.procedures.map((p) => p.slug)).toEqual(procedures.map((p) => p.slug));

      const ruleTokens = free.concat(tokenize(ctx.hook ?? ''));
      const rules = rank(
        knowledge.getCdsRules(),
        (r) => naiveOverlap([r.id, r.title, r.description ?? ''].join(' '), ruleTokens),
        15,
      );
      expect(got.rules.map((r) => r.id)).toEqual(rules.map((r) => r.id));
    }
  });

  it('finds drugs named in the text exactly as the whole-word regex did', () => {
    let namedTotal = 0;
    for (const ctx of contexts()) {
      const conversationText = (ctx.conversation ?? []).map((m) => m.content).join(' ');
      const textHay = `${ctx.question ?? ''} ${conversationText}`.toLowerCase();
      const named = knowledge
        .getDrugs()
        .filter((d) =>
          [d.slug, d.inn, ...(d.tradeNames ?? [])]
            .map((s) => s?.toLowerCase())
            .some((h) => h && h.length > 3 && naiveContainsWord(textHay, h)),
        )
        .slice(0, 25)
        .map((d) => d.slug);
      // Named drugs come first; indication-linked ones may follow.
      const got = retriever.retrieve(ctx).drugs.map((d) => d.slug);
      expect(got.slice(0, named.length)).toEqual(named);
      namedTotal += named.length;
    }
    expect(namedTotal).toBeGreaterThan(0);
  });
});
