import { Inject, Injectable } from '@nestjs/common';
import { KnowledgeRetrieverService } from '../agentic/knowledge-retriever.service';
import { ProviderRouter } from '../agentic/providers/provider-router';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import { REFERENCE_CHAT_SYSTEM, buildReferenceUserMessage } from './reference-chat.prompt';

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
  ) {}

  available(): boolean {
    return this.router.anyConfigured();
  }

  async ask(question: string): Promise<{
    available: boolean;
    answer: string;
    citations: Array<{ kind: string; id: string }>;
    model?: string;
    provider?: string;
  }> {
    if (!this.available()) {
      return {
        available: false,
        answer:
          'The VedaMD reference chat requires an LLM provider, which is not configured on this deployment. You can still browse + search the reference content, view interactions, and use the dose calculator + diagrams.',
        citations: [],
      };
    }

    // Retrieve relevant references using the same retriever as the agentic engine.
    const knowledge = this.retriever.retrieve({ question, diagnoses: [question] });

    const result = await this.router.complete({
      system: REFERENCE_CHAT_SYSTEM,
      user: buildReferenceUserMessage(question, knowledge),
      maxTokens: 1500,
      temperature: 0.0,
    });

    const citations = extractCitations(result.text);

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
      model: result.model,
      provider: result.provider,
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
