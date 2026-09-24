import { Inject, Injectable } from '@nestjs/common';
import { KnowledgeRetrieverService } from '../agentic/knowledge-retriever.service';
import { ProviderRouter } from '../agentic/providers/provider-router';
import { NoMedicalProviderError } from '../agentic/providers/llm-provider.interface';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import { REFERENCE_CHAT_SYSTEM, buildReferenceUserMessage } from './reference-chat.prompt';
import { KnowledgeSearchService } from '../knowledge/knowledge-search.service';
import { assessGrounding } from '../knowledge/grounding/coverage';
import { buildCitationVerifier } from '../agentic/citation-verifier';

/** Shown instead of a model answer when the references do not cover it. */
export const REFERENCE_NOT_COVERED =
  'VedaMD’s reference content does not cover this question, so the reference chat will not answer it. ' +
  'Check your national guideline or formulary. If the drug or condition may be listed under another name, ' +
  'try searching the library for it.';

/**
 * Guarded clinician reference chat.
 *
 * The clinician asks a clinical question; we retrieve the relevant
 * signed-bundle records + ask the LLM to answer STRICTLY from them,
 * citing every claim. The chat never receives patient context (it is
 * a reference tool, not a patient evaluator) — so it is inherently
 * PHI-free. Degrades clearly when no LLM provider is configured.
 *
 * Citations are extracted from the answer text ([drug:x], [ddi:a+b],
 * [condition:y], [procedure:z], [rule:id]) and resolved to their
 * named references so the UI can render a Sources panel + deep links.
 */
@Injectable()
export class ReferenceChatService {
  constructor(
    private readonly retriever: KnowledgeRetrieverService,
    private readonly router: ProviderRouter,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    private readonly search: KnowledgeSearchService,
  ) {}

  available(): boolean {
    return this.router.anyConfigured();
  }

  async ask(question: string): Promise<{
    available: boolean;
    answer: string;
    citations: Array<{ kind: string; id: string; strength?: 'A' | 'B' | 'C' | 'D' }>;
    /** The retrieved references cover the question (see assessGrounding). */
    grounded: boolean;
    /** Declined instead of answering. */
    refused: boolean;
    /** Citations the model gave that name no retrieved record (removed). */
    unverifiedCitationCount?: number;
    model?: string;
    provider?: string;
    fellBackFrom?: string | null;
  }> {
    if (!this.available()) {
      return {
        available: false,
        answer:
          'The VedaMD reference chat requires an LLM provider, which is not configured on this deployment. You can still browse + search the reference content, view interactions, and use the dose calculator + diagrams.',
        citations: [],
        grounded: false,
        refused: true,
      };
    }

    // Retrieve relevant references using the same retriever as the agentic engine.
    const knowledge = this.retriever.retrieve({ question, diagnoses: [question] });

    // The reference chat answers only from the references. It used to call
    // the model whatever was retrieved — and the retriever almost never comes
    // back empty — leaving "not covered" to the model's discretion. Decide it
    // here instead, before any model call.
    const placed = this.retriever.placedRecords(knowledge);
    if (!assessGrounding(question, placed, this.search.termStats()).grounded) {
      return {
        available: true,
        answer: REFERENCE_NOT_COVERED,
        citations: [],
        grounded: false,
        refused: true,
      };
    }

    let result;
    try {
      result = await this.router.complete({
        system: REFERENCE_CHAT_SYSTEM,
        user: buildReferenceUserMessage(question, knowledge),
        maxTokens: 1500,
        temperature: 0.0,
        // Reference answers are clinical content, so the same rule applies.
        requireMedical: true,
      });
    } catch (err) {
      if (err instanceof NoMedicalProviderError) {
        // Saying nothing is the right answer here: browse and search still
        // work, and they serve the same reviewed content without a model.
        return {
          available: false,
          answer:
            'No clinical-grade model is available on this deployment, so the reference chat is off. Browse and search still work and cover the same reviewed content.',
          citations: [],
          grounded: false,
          refused: true,
        };
      }
      throw err;
    }

    // Only citations naming a record retrieved for this question are real;
    // the rest are the model's invention and are dropped from the list.
    const verify = buildCitationVerifier(knowledge);
    const raw = extractCitations(result.text);
    const verified = raw.filter((c) =>
      verify(c.kind as 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule', c.id),
    );
    // Resolve a source-strength tier for every cited bundle record so
    // the chat UI can render an A/B/C/D badge next to each citation,
    // letting the clinician see the underlying evidence quality
    // alongside the LLM-synthesised answer.
    const citations = verified.map((c) => ({
      ...c,
      strength: this.retriever.resolveCitationStrength(
        c.kind as 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
        c.id,
      ),
    }));

    this.log.info('reference_chat', {
      llm_provider: result.provider,
      llm_model: result.model,
      llm_token_input: result.usage?.inputTokens,
      llm_token_output: result.usage?.outputTokens,
      // count only — never the question text (PHI-free discipline)
      agentic_card_count: citations.length,
    });

    return {
      available: true,
      answer: result.text,
      citations,
      grounded: true,
      refused: false,
      unverifiedCitationCount: raw.length - verified.length,
      model: result.model,
      provider: result.provider,
      fellBackFrom: result.fellBackFrom ?? null,
    };
  }
}

/** Extract [kind:id] citation tags from the answer body. */
export function extractCitations(text: string): Array<{ kind: string; id: string }> {
  const out: Array<{ kind: string; id: string }> = [];
  const seen = new Set<string>();
  const re = /\[(drug|ddi|condition|procedure|rule):([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = `${m[1]}:${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: m[1], id: m[2].trim() });
    }
  }
  return out;
}
