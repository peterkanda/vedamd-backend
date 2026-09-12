import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { randomUUID, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditService, type AuditEventType } from './audit.service';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import type { IntegrationLogEntry } from '../integration-log/integration-log.types';
import type { AppConfig } from '../../config/configuration';
import './clinical-audit.types';

/** Which ledger event each clinical surface records. */
const EVENT_BY_KIND: Record<string, AuditEventType> = {
  cds: 'cds.evaluated',
  agentic: 'cds.evaluated',
  assistant: 'assistant.chat',
  reference: 'reference.chat',
};

/**
 * Writes the clinical audit trail, after the response.
 *
 * The ledger and the integration log were both fully built — Postgres tables,
 * migrations, an HMAC chain, a purpose-made `cds.evaluated` event type and
 * dedicated `llm_invoked`/`llm_provider`/`citations` columns — and neither was
 * ever called, so there was no record of what advice was given, by which
 * model, on what evidence. An incident could not be reconstructed.
 *
 * Mirrors `UsageInterceptor`: global, recorded in `finalize()` so it sees the
 * final status code and true latency, and wrapped so it can never delay or
 * fail a clinical response. A clinical request must not fail because its audit
 * row could not be written — but that must be visible, so a failure is logged
 * loudly rather than swallowed.
 */
@Injectable()
export class ClinicalAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClinicalAuditInterceptor.name);
  private readonly hashSecret: string;

  constructor(
    private readonly audit: AuditService,
    private readonly integrationLog: IntegrationLogService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.hashSecret = config.get('audit.hashSecret', { infer: true });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const res = http.getResponse<FastifyReply>();
    const started = Date.now();

    // Accept an inbound correlation id so a trail can be followed across the
    // caller's own logs; mint one otherwise.
    req.vedamdRequestId = headerStr(req.headers['x-request-id']) ?? randomUUID();

    return next.handle().pipe(
      finalize(() => {
        // Only clinical surfaces stash a summary; everything else is covered
        // by the usage interceptor and needs no clinical ledger row.
        const stash = req.vedamdAudit;
        if (!stash) return;
        void this.write(req, res, stash, Date.now() - started);
      }),
    );
  }

  private async write(
    req: FastifyRequest,
    res: FastifyReply,
    stash: NonNullable<FastifyRequest['vedamdAudit']>,
    latencyMs: number,
  ): Promise<void> {
    const statusCode = res.statusCode ?? 0;
    const endpoint = routeTemplate(req);
    const apiKey = req.apiKey;
    const integratorId = apiKey?.integratorId ?? req.operator?.integratorId ?? null;
    // The request id is hashed before storage, like every other identifier.
    const requestIdHash = this.hash(req.vedamdRequestId ?? '');

    try {
      await this.audit.record({
        type: EVENT_BY_KIND[stash.kind] ?? 'cds.evaluated',
        tenantId: integratorId ?? undefined,
        actorId: apiKey?.keyId ?? req.operator?.sub ?? stash.actorId,
        endpoint,
        statusCode,
        latencyMs,
        requestId: requestIdHash,
      });
    } catch (err) {
      this.logger.error(
        `Audit ledger write failed for ${endpoint}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // The integration log is per-integrator, so it only applies to
    // integrator-authenticated traffic (CDS Hooks, agentic API). The mobile
    // assistant authenticates as a clinician and has no integrator.
    if (!integratorId || !apiKey) return;

    const entry: IntegrationLogEntry = {
      request_id: requestIdHash,
      timestamp: new Date().toISOString(),
      environment: apiKey.environment === 'production' ? 'production' : 'sandbox',
      api_key_fingerprint: apiKey.fingerprint,
      endpoint,
      hook: stash.hook as IntegrationLogEntry['hook'],
      latency_ms: latencyMs,
      status_code: statusCode,
      error_category: errorCategory(statusCode),
      rules_evaluated: stash.rulesEvaluated ?? [],
      cards_returned_count: stash.cardsReturned ?? 0,
      card_summaries: stash.cardSummaries ?? [],
      citations: (stash.citations ?? []).map((c) => ({
        label: `${c.kind}:${c.id}`,
        url: `/app/${c.kind}/${encodeURIComponent(c.id)}`,
      })),
      llm_invoked: stash.llmInvoked,
      llm_provider: (stash.llmProvider ?? null) as IntegrationLogEntry['llm_provider'],
      llm_model: stash.llmModel ?? null,
      llm_medical: stash.llmMedical ?? null,
      override_reported: false,
    };

    try {
      await this.integrationLog.record(integratorId, entry);
    } catch (err) {
      // `record()` throws on a non-allow-listed key, which would otherwise
      // surface as a failed clinical request.
      this.logger.error(
        `Integration-log write failed for ${endpoint}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }
}

function headerStr(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Fastify route pattern (no params, no query). Falls back to the raw path. */
function routeTemplate(req: FastifyRequest): string {
  const r = req as unknown as {
    routeOptions?: { url?: string };
    routerPath?: string;
    url?: string;
  };
  const fromOptions = r.routeOptions?.url ?? r.routerPath;
  if (fromOptions) return fromOptions;
  return (r.url ?? '').split('?')[0] || 'unknown';
}

function errorCategory(statusCode: number): IntegrationLogEntry['error_category'] {
  if (statusCode < 400) return 'none';
  if (statusCode === 401 || statusCode === 403) return 'auth';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode < 500) return 'validation';
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return 'downstream';
  return 'internal';
}
