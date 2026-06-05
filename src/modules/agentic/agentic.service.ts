import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeRetrieverService } from './knowledge-retriever.service';
import { ProviderRouter } from './providers/provider-router';
import { LlmPreferenceService } from './llm-preference.service';
import { CdsService } from '../cds/cds.service';
import { CacheService } from '../../common/cache';
import type { AppConfig } from '../../config/configuration';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import { PoliciesService } from '../policies/policies.service';
import type { PolicyMatch } from '../policies/policies.types';
import { CustomRulesService } from '../custom-rules/custom-rules.service';
import type { CustomRuleEvaluation } from '../custom-rules/custom-rules.types';
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
  private readonly nestLogger = new Logger(AgenticService.name);

  constructor(
    private readonly retriever: KnowledgeRetrieverService,
    private readonly router: ProviderRouter,
    private readonly cds: CdsService,
    private readonly cache: CacheService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    @Optional() private readonly policies?: PoliciesService,
    @Optional() private readonly customRules?: CustomRulesService,
    @Optional() private readonly llmPrefs?: LlmPreferenceService,
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

    // --- 2c. Custom CDS rules (per-integrator, developer-defined) ---
    let customMatches: CustomRuleEvaluation[] = [];
    if (this.customRules && ctx.integratorId) {
      try {
        customMatches = await this.customRules.evaluate(ctx.integratorId, {
          hook: ctx.hook,
          medications: ctx.medications,
          diagnoses: ctx.diagnoses,
          allergies: ctx.allergies,
          patient: ctx.patient
            ? {
                ageYears: ctx.patient.ageYears,
                pregnant: ctx.patient.pregnant,
                eGFR: ctx.patient.eGFR,
              }
            : undefined,
          labs: ctx.labs,
        });
      } catch (err) {
        this.log.warn('custom_rules_lookup_failed', {
          error_category: err instanceof Error ? err.name : 'unknown',
        });
      }
    }
    const customCards = customMatches.map((m) => m.card);

    // --- 3. Agentic layer (graceful degrade if unconfigured) ---
    let agenticCards: CdsCard[] = [];
    let citedRecords: Array<{ kind: string; id: string }> = [];
    let llmModel: string | undefined;
    let llmProvider: 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'disabled' = 'disabled';
    let agenticInvoked = false;
    /**
     * Raw LLM text — captured even when extractCards drops every card
     * (no structured JSON, no bundle citations, etc.). Surfaced on the
     * response as `meta.narrative` so the chat UI can fall back to it
     * rather than going silent. The chat marks it clearly as
     * "AI-assisted, unverified" — same transparency principle as the
     * source-strength badges: communicate the trust level explicitly
     * rather than gatekeep it.
     */
    let narrative: string | undefined;
    /** Captured if the LLM call threw (timeout, provider error). */
    let agenticError: string | undefined;

    const mode = ctx.mode ?? 'auto';
    const wantAgentic = mode === 'agentic' || mode === 'auto';
    if (mode === 'agentic' && !this.router.anyConfigured()) {
      throw new Error("mode='agentic' requires an LLM provider, but none is configured.");
    }

    if (wantAgentic && this.router.anyConfigured()) {
      try {
        // Per-integrator LLM preference steers which configured
        // provider is tried first; falls back through the rest on
        // failure (matches the env-default behaviour).
        const preferred =
          ctx.integratorId && this.llmPrefs
            ? this.llmPrefs.get(ctx.integratorId).provider ?? undefined
            : undefined;
        const result = await this.router.complete(
          {
            system: CLINICAL_REASONER_SYSTEM,
            user: buildUserMessage(ctx, knowledge, policyMatches),
            maxTokens: 2048,
            temperature: 0.1,
          },
          { preferredProvider: preferred },
        );
        agenticInvoked = true;
        llmModel = result.model;
        llmProvider = result.provider;
        narrative = stripJsonFromNarrative(result.text);
        const extracted = extractCards(
          result.text,
          new Date().toISOString(),
          ctx.minConfidence ?? 0,
          this.retriever.resolveCitationStrength,
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
        // Capture the error message (sanitised) AND the class so the
        // UI can show what actually went wrong — operators / pilot
        // sites debugging a failing LLM provider need more than
        // "Error". We strip likely-secret patterns (api key prefixes,
        // bearer tokens) before surfacing.
        agenticError = sanitiseErrorMessage(err);
        // PHI-free logger only allow-lists `error_category` for log
        // payloads. The fuller (sanitised) message is surfaced to the
        // UI on `meta.agenticError`, where the operator can read it
        // alongside the failing request.
        this.log.warn('agentic_degraded', {
          error_category: err instanceof Error ? err.name : 'unknown',
        });
        // Also write the sanitised message via the Nest logger so
        // operators see it in process logs — helpful at pilot sites
        // debugging "why isn't the AI answering". The PHI-free log
        // above keeps the audit-grade signal; this one is the
        // operator-grade diagnostic.
        this.nestLogger.warn(
          `LLM call failed (${err instanceof Error ? err.name : 'unknown'}): ${agenticError}`,
        );
      }
    }

    // --- 4. Merge (deterministic + custom rules never dropped;
    //          agentic cards deduped against either) ---
    const cards = mergeCards([...deterministicCards, ...customCards], agenticCards);

    return {
      cards,
      meta: {
        deterministicStrategies: strategies,
        customRuleCount: customMatches.length,
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
        customRuleCitations: customMatches.length
          ? customMatches.map((m) => ({
              ruleId: m.rule.id,
              ruleName: m.rule.name,
              indicator: m.rule.indicator,
            }))
          : undefined,
        // Even when no card fires we surface the catalogue records the
        // retriever found — so a clinician asking a broad question like
        // "antidote for iron overdose" still gets a "Found these in the
        // catalogue" pointer to the deferoxamine drug record + the
        // iron-toxicity antidote. Each entry carries the strongest
        // source-strength tier from the record's references, so the UI
        // can render the badge inline.
        relatedRecords: this.buildRelatedRecords(knowledge),
        // Raw LLM prose when the structured-card extractor dropped
        // everything (no parseable JSON, no bundle citations). Chat
        // surfaces this as an "AI-assisted overview, unverified" panel
        // so the clinician sees the LLM's answer with a clear trust
        // signal — strictly better than a silent empty box.
        narrative: cards.length === 0 ? narrative : undefined,
        // Error class when the LLM call itself threw. Lets the UI
        // surface "AI provider returned an error" instead of pretending
        // the deterministic engine "had nothing to say".
        agenticError,
      },
    };
  }

  /**
   * Cull any leading JSON code-fence / object from the LLM output so the
   * narrative panel doesn't render `{"cards":[…]}` verbatim. Falls back
   * to the original text when there's no JSON to remove.
   */
  // (helper defined at module bottom)

  /**
   * Build a flat, UI-friendly summary of records the retriever surfaced
   * as relevant. Capped at 12 entries to keep responses bounded.
   */
  private buildRelatedRecords(knowledge: import('./agentic.types').RetrievedKnowledge): NonNullable<
    import('./agentic.types').AgenticEvaluationResponse['meta']['relatedRecords']
  > {
    const out: NonNullable<
      import('./agentic.types').AgenticEvaluationResponse['meta']['relatedRecords']
    > = [];
    for (const d of (knowledge.drugs ?? []).slice(0, 4)) {
      out.push({
        kind: 'drug',
        id: d.slug,
        title: d.inn,
        summary: d.summary,
        route: `/app/drugs/${encodeURIComponent(d.slug)}`,
        strength: this.retriever.resolveCitationStrength('drug', d.slug),
      });
    }
    for (const c of (knowledge.conditions ?? []).slice(0, 4)) {
      out.push({
        kind: 'condition',
        id: c.slug,
        title: c.title,
        summary: c.summary,
        route: `/app/conditions/${encodeURIComponent(c.slug)}`,
        strength: this.retriever.resolveCitationStrength('condition', c.slug),
      });
    }
    for (const p of (knowledge.procedures ?? []).slice(0, 2)) {
      out.push({
        kind: 'procedure',
        id: p.slug,
        title: p.title,
        summary: p.summary,
        route: `/app/procedures/${encodeURIComponent(p.slug)}`,
        strength: this.retriever.resolveCitationStrength('procedure', p.slug),
      });
    }
    for (const r of (knowledge.rules ?? []).slice(0, 2)) {
      out.push({
        kind: 'rule',
        id: r.id,
        title: r.title,
        summary: r.description,
        route: `/app/services?serviceId=${encodeURIComponent(r.id)}`,
        strength: this.retriever.resolveCitationStrength('rule', r.id),
      });
    }
    return out;
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
    const cacheKey = {
      patient: ctx.patient,
      medications: normalisedSorted(ctx.medications),
      diagnoses: normalisedSorted(ctx.diagnoses),
      allergies: normalisedSorted(ctx.allergies),
      labs: ctx.labs,
      signals: ctx.signals,
    };
    const ttl = this.config.get('redis.cdsEvaluateTtlSeconds', { infer: true });
    return this.cache.memoize('cds:deterministic', cacheKey, ttl, () =>
      this.runDeterministicUncached(ctx),
    );
  }

  private async runDeterministicUncached(ctx: AgenticClinicalContext): Promise<{
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

function normalisedSorted(arr: string[] | undefined): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return [...arr].map((s) => s.trim().toLowerCase()).sort();
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


/**
 * Cull JSON code-fences / structured-card blob from LLM output so the
 * narrative-panel rendering does not echo raw JSON to the clinician.
 * Returns the prose around / after the JSON, or the original text when
 * no JSON block is present.
 */
function stripJsonFromNarrative(text: string): string {
  if (!text) return text;
  // Strip ```json fenced blocks first.
  let s = text.replace(/```(?:json)?\s*[\s\S]*?```/g, "").trim();
  // Strip a bare top-level JSON object.
  s = s.replace(/^\{[\s\S]*?\n\}\s*/m, "").trim();
  if (!s) return text; // Fall back if removal stripped everything.
  return s;
}

/**
 * Best-effort error → safe-display-string conversion for surfacing to
 * the chat UI. Captures `err.message` (more informative than `err.name`)
 * and scrubs likely-secret patterns. Falls back to the constructor name
 * if no message is available.
 *
 * Examples:
 *   new Error("OpenAI 429 rate_limit_exceeded")        → "OpenAI 429 rate_limit_exceeded"
 *   new Error("Bearer sk-abc123… invalid")             → "Bearer [REDACTED] invalid"
 *   AbortError (timeout)                               → "AbortError"
 *   Plain string thrown                                → first 240 chars
 */
function sanitiseErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message || err.name
      : typeof err === 'string'
        ? err
        : 'unknown';
  // Redact common secret patterns so we don't leak keys via the chat UI.
  const scrubbed = raw
    .replace(/\b(sk|vmd|Bearer)[-_]\w+/gi, '$1 [REDACTED]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/authorization[=:]\s*\S+/gi, 'authorization=[REDACTED]');
  return scrubbed.length > 240 ? scrubbed.slice(0, 237) + '…' : scrubbed;
}
