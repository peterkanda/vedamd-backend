import { Inject, Injectable, Optional } from '@nestjs/common';
import { KnowledgeRetrieverService } from './knowledge-retriever.service';
import { ProviderRouter } from './providers/provider-router';
import { CdsService } from '../cds/cds.service';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import { PoliciesService } from '../policies/policies.service';
import type { PolicyMatch } from '../policies/policies.types';
import { CLINICAL_REASONER_SYSTEM, buildUserMessage } from './prompts/clinical-reasoner.prompt';
import { extractCards } from './card-extractor';
import type {
  AgenticClinicalContext,
  AgenticEvaluationResponse,
  AgenticBatchResponse,
} from './agentic.types';
import type { CdsCard, CdsHookRequest } from '../cds/cds.types';

/**
 * Agentic CDS service.
 *
 * Pipeline:
 *   1. DETERMINISTIC layer — run the existing CDS strategies (DDI,
 *      AWaRe, pregnancy, paediatric dosing, IMCI, WHO PEN, etc.).
 *      These ALWAYS run and form the safety floor.
 *   2. RETRIEVAL — pick the bundle records relevant to the context.
 *   3. AGENTIC layer — Claude (fallback OpenAI) reasons over the
 *      retrieved knowledge + patient context, returns structured cards.
 *   4. MERGE — combine deterministic + agentic cards, dedupe, sort by
 *      severity. Deterministic cards are never dropped.
 *
 * If no LLM provider is configured, the engine degrades gracefully to
 * the deterministic layer only (still useful, still safe).
 *
 * STATELESS: nothing here is logged with PHI, cached, or persisted.
 */
@Injectable()
export class AgenticService {
  constructor(
    private readonly retriever: KnowledgeRetrieverService,
    private readonly router: ProviderRouter,
    private readonly cds: CdsService,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    @Optional() private readonly policies?: PoliciesService,
  ) {}

  async evaluate(ctx: AgenticClinicalContext): Promise<AgenticEvaluationResponse> {
    const started = Date.now();

    // --- 1. Deterministic safety floor ---
    const { cards: deterministicCards, strategies } = await this.runDeterministic(ctx);

    // --- 2. Retrieval ---
    const knowledge = this.retriever.retrieve(ctx);
    const bundleRecordsConsidered = this.retriever.totalRecords();

    // --- 2b. Policy retrieval (per-integrator standards / SOPs) ---
    let policyMatches: PolicyMatch[] = [];
    if (this.policies && ctx.integratorId) {
      try {
        policyMatches = await this.policies.findRelevant(ctx.integratorId, {
          question: ctx.question,
          medications: ctx.medications,
          diagnoses: ctx.diagnoses,
          allergies: ctx.allergies,
        });
      } catch (err) {
        this.log.warn('policies_lookup_failed', {
          error_category: err instanceof Error ? err.name : 'unknown',
        });
      }
    }

    // --- 3. Agentic layer (graceful degrade if unconfigured) ---
    let agenticCards: CdsCard[] = [];
    let citedRecords: Array<{ kind: string; id: string }> = [];
    let llmModel: string | undefined;
    let llmProvider: 'anthropic' | 'openai' | 'disabled' = 'disabled';
    let agenticInvoked = false;

    const mode = ctx.mode ?? 'auto';
    const wantAgentic = mode === 'agentic' || mode === 'auto';
    if (mode === 'agentic' && !this.router.anyConfigured()) {
      throw new Error("mode='agentic' requires an LLM provider, but none is configured.");
    }

    if (wantAgentic && this.router.anyConfigured()) {
      try {
        const result = await this.router.complete({
          system: CLINICAL_REASONER_SYSTEM,
          user: buildUserMessage(ctx, knowledge, policyMatches),
          maxTokens: 2048,
          temperature: 0.1,
        });
        agenticInvoked = true;
        llmModel = result.model;
        llmProvider = result.provider;
        const extracted = extractCards(
          result.text,
          new Date().toISOString(),
          ctx.minConfidence ?? 0,
        );
        agenticCards = extracted.cards;
        citedRecords = extracted.citedRecords;
        this.log.info('agentic_evaluated', {
          llm_provider: result.provider,
          llm_model: result.model,
          llm_token_input: result.usage?.inputTokens,
          llm_token_output: result.usage?.outputTokens,
          agentic_card_count: agenticCards.length,
          deterministic_card_count: deterministicCards.length,
        });
      } catch (err) {
        // Degrade to deterministic-only. Never fail the whole request.
        this.log.warn('agentic_degraded', {
          error_category: err instanceof Error ? err.name : 'unknown',
        });
      }
    }

    // --- 4. Merge (deterministic never dropped) ---
    const cards = mergeCards(deterministicCards, agenticCards);

    return {
      cards,
      meta: {
        deterministicStrategies: strategies,
        llmModel,
        llmProvider,
        agenticInvoked,
        bundleRecordsConsidered,
        citedRecords,
        agenticLatencyMs: Date.now() - started,
        policyCitations: policyMatches.length
          ? policyMatches.map((m) => ({
              policyId: m.policyId,
              name: m.name,
              source: m.source,
              version: m.version,
              sectionTitle: m.sectionTitle,
              snippet: m.snippet,
            }))
          : undefined,
      },
    };
  }

  /**
   * Population / retrospective batch evaluation. Each item is
   * evaluated independently with bounded concurrency so a large sweep
   * doesn't exhaust the LLM rate limit or memory. Per-item failures
   * are isolated (returned as an error entry, never failing the batch).
   * A roll-up summary counts cards by indicator across the batch so a
   * caller can triage the worst patients first.
   *
   * STATELESS: item ids + contexts are evaluated in-memory only; never
   * logged or persisted.
   */
  async evaluateBatch(
    items: Array<AgenticClinicalContext & { id?: string }>,
    concurrency = Number(process.env.AGENTIC_BATCH_CONCURRENCY ?? 4),
  ): Promise<AgenticBatchResponse> {
    const started = Date.now();
    const results: AgenticBatchResponse['results'] = new Array(items.length);
    const limit = Math.max(1, Math.min(concurrency, 16));
    let cursor = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        const { id, ...ctx } = items[i];
        try {
          const evaluation = await this.evaluate(ctx);
          results[i] = { id, ok: true, evaluation };
        } catch (err) {
          results[i] = {
            id,
            ok: false,
            error: err instanceof Error ? err.name : 'evaluation_failed',
          };
        }
      }
    };

    await Promise.all(Array.from({ length: limit }, () => worker()));

    // Roll-up summary across all successful items.
    const summary = { critical: 0, warning: 0, info: 0, errored: 0, evaluated: 0 };
    for (const r of results) {
      if (!r.ok) {
        summary.errored++;
        continue;
      }
      summary.evaluated++;
      for (const card of r.evaluation.cards) {
        if (card.indicator === 'critical') summary.critical++;
        else if (card.indicator === 'warning') summary.warning++;
        else summary.info++;
      }
    }

    this.log.info('agentic_batch_evaluated', {
      batch_item_count: items.length,
      batch_evaluated: summary.evaluated,
      batch_errored: summary.errored,
      batch_critical_cards: summary.critical,
      latency_ms: Date.now() - started,
    });

    return { results, summary, batchLatencyMs: Date.now() - started };
  }

  /**
   * Run the deterministic CDS strategies by mapping the agentic
   * context onto a CDS Hooks request and invoking the existing
   * medication-prescribe + patient-view services.
   */
  private async runDeterministic(ctx: AgenticClinicalContext): Promise<{
    cards: CdsCard[];
    strategies: string[];
  }> {
    const context: Record<string, unknown> = {
      ...(ctx.signals ?? {}),
    };
    if (ctx.medications?.length) context.medications = ctx.medications;
    if (ctx.diagnoses?.length) context.diagnoses = ctx.diagnoses;
    if (ctx.allergies?.length) context.allergies = ctx.allergies;
    if (ctx.patient) {
      const p = ctx.patient;
      if (p.ageYears != null) context.ageYears = p.ageYears;
      if (p.ageMonths != null) context.ageMonths = p.ageMonths;
      if (p.weightKg != null) context.weightKg = p.weightKg;
      if (p.sex != null) context.sex = p.sex;
      if (p.pregnant != null) context.pregnant = p.pregnant;
      if (p.gestationWeeks != null) context.gestationWeeks = p.gestationWeeks;
      if (p.eGFR != null) context.eGFR = p.eGFR;
      if (p.creatinineUmolL != null) context.creatinineUmolL = p.creatinineUmolL;
    }

    const cards: CdsCard[] = [];
    const strategies = new Set<string>();
    const hooks: Array<{ hook: string; service: string }> = [
      { hook: 'medication-prescribe', service: 'vedamd-medication-prescribe' },
      { hook: 'patient-view', service: 'vedamd-patient-view' },
    ];

    for (const { hook, service } of hooks) {
      const req: CdsHookRequest = {
        hook,
        hookInstance: 'agentic-internal',
        context,
      };
      try {
        const resp = await this.cds.evaluateHook(service, req);
        for (const card of resp.cards) {
          cards.push(card);
          const ruleId = card.extension?.['http://vedamd.io/Card/recommendation']?.ruleId;
          if (ruleId) strategies.add(ruleId);
        }
      } catch {
        // A strategy throwing must not break agentic evaluation.
      }
    }

    return { cards, strategies: [...strategies] };
  }
}

const INDICATOR_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Merge deterministic + agentic cards. Deterministic cards are
 * authoritative for their domain and are never dropped. Agentic cards
 * that duplicate a deterministic card's summary (case-insensitive
 * token overlap > 0.6) are suppressed to reduce alert fatigue.
 */
function mergeCards(deterministic: CdsCard[], agentic: CdsCard[]): CdsCard[] {
  const out = [...deterministic];
  for (const ac of agentic) {
    const dup = deterministic.some((dc) => summaryOverlap(dc.summary, ac.summary) > 0.6);
    if (!dup) out.push(ac);
  }
  out.sort((a, b) => (INDICATOR_RANK[a.indicator] ?? 3) - (INDICATOR_RANK[b.indicator] ?? 3));
  return out;
}

function summaryOverlap(a: string, b: string): number {
  const ta = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
  const tb = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}
