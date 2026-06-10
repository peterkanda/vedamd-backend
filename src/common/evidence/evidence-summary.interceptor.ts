import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { evidenceSummary } from './evidence-summary';

/**
 * Global response interceptor that attaches a computed `evidenceSummary`
 * next to every `references[]` array in a response — so the A–D evidence
 * scoring is available uniformly across all content domains without each
 * controller hand-rolling it.
 *
 * It is COPY-ON-WRITE: it never mutates the in-memory (cached) bundle
 * records — it returns a shallow clone only along the paths it annotates,
 * and the original object when nothing changes. Depth-capped, and a no-op for
 * responses with no references (auth, usage, search summaries, etc.).
 */
const MAX_DEPTH = 4;

export function annotateEvidence(node: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    let changed = false;
    const mapped = node.map((n) => {
      const a = annotateEvidence(n, depth + 1);
      if (a !== n) changed = true;
      return a;
    });
    return changed ? mapped : node;
  }

  const obj = node as Record<string, unknown>;
  let base = obj;
  if (Array.isArray(obj.references) && obj.evidenceSummary === undefined) {
    const summary = evidenceSummary(obj.references);
    if (summary) base = { ...obj, evidenceSummary: summary };
  }

  let changed = base !== obj;
  let result = base;
  for (const [k, v] of Object.entries(base)) {
    const a = annotateEvidence(v, depth + 1);
    if (a !== v) {
      if (!changed) {
        result = { ...base };
        changed = true;
      }
      (result as Record<string, unknown>)[k] = a;
    }
  }
  return changed ? result : obj;
}

@Injectable()
export class EvidenceSummaryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(map((body) => annotateEvidence(body)));
  }
}
