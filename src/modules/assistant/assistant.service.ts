import { Injectable } from '@nestjs/common';
import {
  KnowledgeSearchService,
  type KnowledgeSearchHit,
} from '../knowledge/knowledge-search.service';
import { ProviderRouter } from '../agentic/providers/provider-router';
import { NoMedicalProviderError } from '../agentic/providers/llm-provider.interface';
import { ASSISTANT_CHAT_SYSTEM, buildAssistantUserMessage } from './assistant.prompt';
import { isClinicalClaim, ungroundedRefusal } from './clinical-claim';
import { populationNote } from '../reference-ranges/reference-ranges.types';

export interface AssistantChatRequest {
  question: string;
  conversation?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AssistantSource {
  domain: string;
  slug: string;
  title: string;
}

export interface AssistantChatResponse {
  answer: string;
  sources: AssistantSource[];
  provider: string;
  /** Actual model that produced the answer (e.g. the MedGemma id from OpenRouter). */
  model: string;
  grounded: boolean;
  /** True when we declined to answer rather than guess at an ungrounded
   *  clinical fact — mirrors the on-device mobile gate exactly. */
  refused: boolean;
  /** False only when generation was cut short. The backend never streams or
   *  aborts mid-answer today, so this is always true — kept for shape parity
   *  with the mobile GroundedAnswer type. */
  complete: boolean;
}

/**
 * Record fields that carry no clinical meaning for a reader — ids, codings
 * and provenance. Everything NOT listed here is offered to the model.
 *
 * This used to be the other way round: an allow-list of fields to keep,
 * written around `conditions` and `drugs`. Any domain whose answer lived in
 * a field nobody had added was silently emptied. A reference-range record
 * reached the model as {"analyte":"Sodium","category":"electrolytes"} — the
 * interval itself, 135-145 mmol/L, was dropped — and a notifiable-disease
 * record as {"disease":"Smallpox"}, without the notification level or
 * timeframe that is the entire point of the record. The model then answered
 * from its own memory while the UI cited the record as the source, which is
 * precisely the failure the citation architecture exists to prevent.
 *
 * Denying noise instead of permitting signal means a new field, or a new
 * domain, is grounded by default rather than invisibly discarded.
 */
const DROP_FIELDS = new Set([
  // Identity + provenance
  'slug',
  'ruleVersion',
  'reviewStatus',
  'reviewers',
  'approvedAt',
  'lastReviewed',
  'evidenceLevel',
  'references',
  'citations',
  'retrievedAt',
  // Codings — the model reasons over prose, not code systems, and these
  // crowd out real content inside the per-record budget.
  'icd10',
  'icd11',
  'snomed',
  'loinc',
  'rxnorm',
  'atc',
  'setId',
  'splVersion',
  'rxcuiIngredients',
  'applicationNumbers',
  // Internal cross-links; the prose names the drug already.
  'drugSlug',
  'drugSlugs',
  'conditionSlug',
  'antidoteSlug',
  'antidoteDrugSlug',
  'anticoagulantDrugSlug',
  'vaccineDrugSlug',
  'drugASlug',
  'drugBSlug',
  'domains',
]);

/**
 * Fields pulled to the front of a record summary, most decision-bearing
 * first, because the per-record budget may not fit everything. Anything not
 * named here still follows in the record's own key order.
 */
const PRIORITY_FIELDS = [
  // What the record is about
  'title',
  'analyte',
  'drug',
  'inn',
  'name',
  'disease',
  'allergen',
  'anticoagulant',
  'poison',
  'antidote',
  'vaccine',
  'gene',
  'chiefComplaint',
  'abbrev',
  // The answer itself
  'oneLiner',
  'summary',
  'appliesTo',
  'low',
  'high',
  'unit',
  'status',
  'level',
  'timeframe',
  'severity',
  'risk',
  'recommendation',
  'pregnancyCompatibility',
  'lactationCompatibility',
  'worstClassDecision',
  'guidance',
  'dosing',
  'doses',
  'management',
  'protocols',
  'interpretation',
  'redFlags',
  'contraindications',
  'warnings',
  'crossReactsWith',
  'alternatives',
  'monitoring',
  'sections',
  'items',
];

const PER_RECORD_CHARS = 700;
const TOTAL_GROUNDING_CHARS = 6000;
const MAX_SOURCES = 8;

/**
 * Shortest word worth searching on its own in the retrieval fallback. Three
 * keeps clinically load-bearing acronyms (DKA, HIV, ART, ORS) searchable.
 */
const MIN_TERM_LEN = 3;

/** Upper bound on fallback searches per question — each is a full bundle pass. */
const MAX_FALLBACK_TERMS = 6;

/**
 * How many hits to look at when judging a term's rarity. Wide enough to tell
 * a drug name (a handful of records) from a broad clinical word (hundreds).
 */
const DF_PROBE_LIMIT = 60;

/**
 * Words that carry no grounding evidence on their own — question
 * scaffolding, plus the generic clinical vocabulary that appears verbatim
 * in thousands of records ("dose", "treatment", "paediatric").
 *
 * Excluding them is what keeps the fallback honest. Left in, the single
 * word "dose" matched records containing that literal word, so
 * "qwertyuiop dose for asdfghjkl" and a question about an invented drug
 * both came back "grounded" on eight unrelated records — manufacturing
 * citations for a question nothing in the bundle answers, which is worse
 * than refusing. A term has to name something clinical to count as
 * evidence.
 */
const NON_EVIDENCE_WORDS = new Set([
  // question scaffolding
  'what',
  'when',
  'which',
  'where',
  'does',
  'should',
  'would',
  'could',
  'give',
  'giving',
  'take',
  'used',
  'using',
  'about',
  'there',
  'this',
  'that',
  'with',
  'from',
  'into',
  'have',
  'need',
  'much',
  'many',
  'how',
  'the',
  'for',
  'and',
  'are',
  'can',
  'you',
  'per',
  // generic clinical vocabulary — present in a large share of records
  'dose',
  'doses',
  'dosing',
  'dosage',
  'adult',
  'adults',
  'child',
  'children',
  'paediatric',
  'pediatric',
  'infant',
  'neonate',
  'patient',
  'patients',
  'treatment',
  'treat',
  'therapy',
  'management',
  'manage',
  'range',
  'level',
  'levels',
  'safe',
  'safety',
  'best',
  'first',
  'line',
  'drug',
  'drugs',
  'medicine',
  'medication',
  'tablet',
  'daily',
  // Claim markers — the very words isClinicalClaim() keys on. They say what
  // KIND of question this is, never what it is about, so they must not steer
  // retrieval: "contraindicated" is indexed in only a handful of records,
  // which made it look rare and therefore valuable, and it outranked the
  // metformin monograph in "Is metformin contraindicated in renal
  // impairment?" — the one record the question was actually about.
  'contraindicated',
  'contraindication',
  'contraindications',
  'interact',
  'interacts',
  'interaction',
  'interactions',
  'titrate',
  'threshold',
  'maximum',
  'minimum',
  'loading',
  'maintenance',
  'prescribe',
  'prescription',
  'regimen',
  'therapeutic',
]);

/**
 * Add the qualification a record implies but does not state, so the model
 * cannot answer past it.
 *
 * Every reference range in the v0.1 bundle is an adult interval and not one
 * of the 321 records says so — none carries an age band at all. Grounded on
 * the bare numbers, a question about a child gets an adult interval quoted
 * back with a VedaMD citation attached and nothing to signal it does not
 * apply. The analytes that move most with age are precisely the ones where
 * an adult figure is plausible, precise and wrong.
 */
function annotate(domain: string, rec: Record<string, unknown>): Record<string, unknown> {
  if (domain !== 'reference-ranges') return rec;
  return { ...rec, appliesTo: populationNote(rec as Parameters<typeof populationNote>[0]) };
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly search: KnowledgeSearchService,
    private readonly router: ProviderRouter,
  ) {}

  /**
   * Compact a record to its clinically useful fields for grounding.
   *
   * Fields are added highest-priority first and the result is cut at a whole
   * field, so the block handed to the model is always valid JSON. The old
   * version sliced the serialized string at a fixed length, which could sever
   * it mid-token — the same half-written-JSON problem this codebase already
   * had coming back from the provider.
   */
  private summarize(rec: Record<string, unknown>): string {
    const keys = [
      ...PRIORITY_FIELDS.filter((k) => rec[k] !== undefined),
      ...Object.keys(rec).filter(
        (k) => !DROP_FIELDS.has(k) && !PRIORITY_FIELDS.includes(k) && rec[k] !== undefined,
      ),
    ];
    const out: Record<string, unknown> = {};
    let truncated = false;
    for (const k of keys) {
      if (DROP_FIELDS.has(k)) continue;
      const candidate = { ...out, [k]: rec[k] };
      if (JSON.stringify(candidate).length > PER_RECORD_CHARS) {
        truncated = true;
        continue;
      }
      out[k] = rec[k];
    }
    const json = JSON.stringify(out);
    return truncated ? `${json} (truncated)` : json;
  }

  /**
   * Find grounding records for a free-text clinical question.
   *
   * KnowledgeSearchService AND-gates every query token, which is right for
   * the Browse-style lookup it was built for ("amoxicillin") but returns
   * nothing for a natural question: "amoxicillin dose" already scores zero,
   * because no drug record carries the literal word "dose". Feeding the raw
   * question straight in meant `grounded` was false for virtually every real
   * question — and once the ungrounded-clinical-claim gate below is armed,
   * that turns into refusing questions the knowledge base answers well.
   *
   * So: try the whole question first, and if it finds nothing, fall back to
   * the salient terms individually, ranking a record by how many of those
   * terms it matched. A gate is only as good as the retrieval under it.
   */
  private retrieve(question: string): KnowledgeSearchHit[] {
    const direct = this.search.search(question, MAX_SOURCES);
    if (direct.length > 0) return direct;

    const terms = [
      ...new Set(
        question
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= MIN_TERM_LEN && !NON_EVIDENCE_WORDS.has(t)),
      ),
    ]
      // Each term costs a full pass over the bundle, so bound the work and
      // spend it on the most specific words. Length is a crude stand-in for
      // rarity, but a reliable one here: drug and condition names
      // ("artemether", "fluconazole") run long, and the short generic words
      // that would dominate an unbounded scan are already excluded above.
      .sort((a, b) => b.length - a.length)
      .slice(0, MAX_FALLBACK_TERMS);
    if (terms.length === 0) return [];

    // Rank terms by how rare they are — a term matching a handful of records
    // is naming something specific; one matching hundreds is background.
    const perTerm = terms
      .map((term) => ({ term, hits: this.search.search(term, DF_PROBE_LIMIT) }))
      .filter((t) => t.hits.length > 0)
      .sort((a, b) => a.hits.length - b.hits.length);
    if (perTerm.length === 0) return [];

    // Interleave the terms' results rather than ranking every record on one
    // scale. A clinical question routinely names two subjects — "ceftriaxone
    // dose in meningitis" — and scoring them against each other let the rarer
    // term take all eight grounding slots, dropping the other subject
    // entirely. Round-robin guarantees each salient term is represented.
    const picked: KnowledgeSearchHit[] = [];
    const seen = new Set<string>();
    const depth = Math.max(...perTerm.map((t) => t.hits.length));
    for (let i = 0; i < depth && picked.length < MAX_SOURCES; i++) {
      for (const { hits } of perTerm) {
        if (picked.length >= MAX_SOURCES) break;
        const hit = hits[i];
        if (!hit) continue;
        const key = `${hit.domain}/${hit.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(hit);
      }
    }
    return picked;
  }

  async chat(req: AssistantChatRequest): Promise<AssistantChatResponse> {
    const question = (req.question ?? '').trim();
    if (!question) {
      return {
        answer: 'Please enter a clinical question.',
        sources: [],
        provider: 'none',
        model: 'none',
        grounded: false,
        refused: false,
        complete: true,
      };
    }

    // Retrieve relevant records and build a grounding block.
    const hits = this.retrieve(question);
    const sources: AssistantSource[] = [];
    const blocks: string[] = [];
    let used = 0;
    for (const hit of hits) {
      const rec = hit.slug ? this.search.getRecord(hit.domain, hit.slug) : null;
      const text = rec ? this.summarize(annotate(hit.domain, rec)) : (hit.snippet ?? '');
      const entry = `[${hit.domain}/${hit.slug}] ${hit.title}\n${text}`;
      if (used + entry.length > TOTAL_GROUNDING_CHARS) break;
      blocks.push(entry);
      used += entry.length;
      sources.push({ domain: hit.domain, slug: hit.slug, title: hit.title });
    }

    const grounded = blocks.length > 0;

    // Nothing verified to stand on, and the question turns on a specific
    // clinical fact — refuse instead of answering from the model's parametric
    // memory. Zero LLM invocation: fail closed, mirroring the on-device gate.
    if (!grounded && isClinicalClaim(question)) {
      return {
        answer: ungroundedRefusal(),
        sources,
        provider: 'none',
        model: 'none',
        grounded: false,
        refused: true,
        complete: true,
      };
    }

    const grounding = grounded ? blocks.join('\n\n') : 'No matching local content was found.';

    let result;
    try {
      result = await this.router.complete({
        system: ASSISTANT_CHAT_SYSTEM,
        user: buildAssistantUserMessage(question, grounding, grounded, req.conversation ?? []),
        temperature: 0.1,
        maxTokens: 1024,
        // This answers a clinician's clinical question, so it may only come from
        // a model the operator has declared clinical-grade.
        requireMedical: true,
      });
    } catch (err) {
      if (err instanceof NoMedicalProviderError) {
        // Return the retrieved sources rather than nothing: the clinician can
        // still read the reviewed content the answer would have been built on.
        return {
          answer:
            'No clinical-grade model is available right now, so I will not answer this from a general-purpose model. The VedaMD content below covers your question, and the on-device assistant works offline.',
          sources,
          provider: 'none',
          model: 'none',
          grounded: false,
          refused: false,
          complete: true,
        };
      }
      throw err;
    }

    return {
      answer: result.text.trim(),
      sources,
      provider: result.provider,
      model: result.model,
      grounded,
      refused: false,
      complete: true,
    };
  }
}
