import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UsageService, type UsageActorType } from './usage.service';

/**
 * Global interceptor that records one usage event per HTTP request,
 * AFTER the response is produced. The write is fire-and-forget inside
 * UsageService, so this adds no latency to the response and can never
 * fail a request.
 *
 * It captures the route TEMPLATE only (never params / query / body),
 * the actor (operator or API key, from the auth guards that already
 * ran), and a coarse category so the usage dashboard can break traffic
 * into chat / search / reference / cds / developer / api.
 */
@Injectable()
export class UsageInterceptor implements NestInterceptor {
  constructor(private readonly usage: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const res = http.getResponse<FastifyReply>();
    const started = Date.now();
    const method = (req.method ?? 'GET').toUpperCase();
    const endpoint = routeTemplate(req);

    if (shouldSkip(method, endpoint)) return next.handle();

    return next.handle().pipe(
      finalize(() => {
        try {
          const apiKey = req.apiKey;
          const operator = req.operator;
          const headerIntegrator = headerStr(req.headers['x-integrator-id']);
          const integratorId =
            apiKey?.integratorId ?? operator?.integratorId ?? headerIntegrator ?? null;
          const actorType: UsageActorType = apiKey ? 'api_key' : operator ? 'operator' : 'anonymous';

          this.usage.record({
            integratorId,
            actorType,
            actorHash: apiKey?.fingerprint ?? null,
            actorId: operator?.sub ?? null,
            method,
            endpoint,
            category: categorize(endpoint),
            statusCode: res.statusCode ?? 0,
            latencyMs: Date.now() - started,
            environment: apiKey?.environment ?? null,
          });
        } catch {
          // Analytics must never break the response.
        }
      }),
    );
  }
}

/** Fastify route pattern (no params, no query). Falls back to the raw path. */
function routeTemplate(req: FastifyRequest): string {
  const r = req as unknown as { routeOptions?: { url?: string }; routerPath?: string; url?: string };
  const fromOptions = r.routeOptions?.url ?? r.routerPath;
  if (fromOptions) return fromOptions;
  return (r.url ?? '').split('?')[0] || 'unknown';
}

function headerStr(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function shouldSkip(method: string, endpoint: string): boolean {
  if (method === 'OPTIONS' || method === 'HEAD') return true;
  if (!endpoint || endpoint === 'unknown') return true;
  // Don't count health checks, docs, or the usage endpoints themselves.
  return /\/health|\/docs|\/usage(\b|\/)/.test(endpoint);
}

/** Coarse traffic bucket from the route template. */
function categorize(endpoint: string): string {
  const e = endpoint.toLowerCase();
  if (e.includes('/reference/chat') || e.includes('/agentic/') || e.includes('/assistant')) {
    return 'chat';
  }
  if (e.includes('/search')) return 'search';
  if (e.includes('/cds-services') || e.includes('/cds/') || e.includes('/cds-feedback')) {
    return 'cds';
  }
  if (
    /\/(developer|api-keys|policies|custom-rules|notifications|audits|data-sources|integration-log|services|playground|integrations)(\b|\/)/.test(
      e,
    )
  ) {
    return 'developer';
  }
  if (
    e.includes('/reference') ||
    /\/(drugs|conditions|procedures|clinical-scores|scores|antidotes|toxidromes|anticoagulant-reversal|iv-compatibility|pregnancy-lactation|hepatic-dose|symptom-triage|reference-ranges|drug-disease|immunization|allergy|notifiable|pharmacogenomics|terminology|knowledge|dose)(\b|\/)/.test(
      e,
    )
  ) {
    return 'reference';
  }
  return 'api';
}
