import { Injectable } from '@nestjs/common';
import { KnowledgeSearchService } from '../knowledge/knowledge-search.service';
import { ProviderRouter } from '../agentic/providers/provider-router';
import { ASSISTANT_CHAT_SYSTEM, buildAssistantUserMessage } from './assistant.prompt';

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
}

// Fields worth keeping when summarising a record into grounding text.
const KEEP_FIELDS = [
  'title',
  'inn',
  'name',
  'chiefComplaint',
  'analyte',
  'gene',
  'drug',
  'disease',
  'poison',
  'antidote',
  'vaccine',
  'oneLiner',
  'purpose',
  'abbrev',
  'drugClass',
  'category',
  'indications',
  'presentation',
  'redFlags',
  'management',
  'dosing',
  'diagnostics',
  'differential',
  'disposition',
  'interpretation',
  'contraindications',
  'warnings',
  'monitoring',
  'pregnancy',
  'lactation',
  'guidance',
  'effect',
  'severity',
  'mechanism',
  'items',
  'scoring',
];

const PER_RECORD_CHARS = 700;
const TOTAL_GROUNDING_CHARS = 6000;
const MAX_SOURCES = 8;

@Injectable()
export class AssistantService {
  constructor(
    private readonly search: KnowledgeSearchService,
    private readonly router: ProviderRouter,
  ) {}

  /** Compact a record to its clinically useful fields for grounding. */
  private summarize(rec: Record<string, unknown>): string {
    const out: Record<string, unknown> = {};
    for (const k of KEEP_FIELDS) if (rec[k] !== undefined) out[k] = rec[k];
    let json = JSON.stringify(out);
    if (json.length > PER_RECORD_CHARS) json = json.slice(0, PER_RECORD_CHARS) + '…';
    return json;
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
      };
    }

    // Retrieve relevant records and build a grounding block.
    const hits = this.search.search(question, MAX_SOURCES);
    const sources: AssistantSource[] = [];
    const blocks: string[] = [];
    let used = 0;
    for (const hit of hits) {
      const rec = hit.slug ? this.search.getRecord(hit.domain, hit.slug) : null;
      const text = rec ? this.summarize(rec) : (hit.snippet ?? '');
      const entry = `[${hit.domain}/${hit.slug}] ${hit.title}\n${text}`;
      if (used + entry.length > TOTAL_GROUNDING_CHARS) break;
      blocks.push(entry);
      used += entry.length;
      sources.push({ domain: hit.domain, slug: hit.slug, title: hit.title });
    }

    const grounded = blocks.length > 0;
    const grounding = grounded ? blocks.join('\n\n') : 'No matching local content was found.';

    const result = await this.router.complete({
      system: ASSISTANT_CHAT_SYSTEM,
      user: buildAssistantUserMessage(question, grounding, grounded, req.conversation ?? []),
      temperature: 0.1,
      maxTokens: 1024,
    });

    return {
      answer: result.text.trim(),
      sources,
      provider: result.provider,
      model: result.model,
      grounded,
    };
  }
}
