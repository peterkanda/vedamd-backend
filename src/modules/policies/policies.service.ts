import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { policies as policiesTable } from '../../db/schema';
import type {
  Policy,
  PolicyCreateDto,
  PolicyMatch,
  PolicySection,
  PolicySummary,
} from './policies.types';

interface RelevanceSignals {
  question?: string;
  medications?: string[];
  diagnoses?: string[];
  allergies?: string[];
}

/**
 * Per-integrator policy store.
 *
 * Storage backend:
 *   - When `DATABASE_URL` is configured (production / Supabase),
 *     policies are stored in the Postgres `policies` table via drizzle.
 *   - In dev / unit tests with no DATABASE_URL, an in-memory store is
 *     used. There is NO disk persistence — durable state lives in the
 *     database only, by design.
 *
 * Policies are integrator-scoped clinical SOPs / standards (JCI, ISO,
 * WHO position papers, NICE summaries, company guidelines). They are
 * never global, never carry patient identity, and never logged.
 */
@Injectable()
export class PoliciesService implements OnModuleInit {
  private readonly nestLogger = new Logger(PoliciesService.name);
  private readonly memByIntegrator = new Map<string, Policy[]>();

  constructor(@Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null) {}

  onModuleInit(): void {
    if (this.db) {
      this.nestLogger.log('PoliciesService using Postgres (drizzle) storage.');
    } else {
      this.nestLogger.warn(
        'PoliciesService running with IN-MEMORY store (no DATABASE_URL). Entries are lost on restart.',
      );
    }
  }

  async list(integratorId: string): Promise<PolicySummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(policiesTable)
        .where(eq(policiesTable.integratorId, integratorId))
        .orderBy(desc(policiesTable.uploadedAt));
      return rows.map(rowToSummary);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).map(toSummary);
  }

  async get(integratorId: string, id: string): Promise<Policy | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(policiesTable)
        .where(and(eq(policiesTable.integratorId, integratorId), eq(policiesTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      return rowToPolicy(rows[0]);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).find((p) => p.id === id) ?? null;
  }

  async create(integratorId: string, dto: PolicyCreateDto, uploadedBy?: string): Promise<Policy> {
    const sections = normaliseSections(dto);
    const sizeBytes = sections.reduce((n, s) => n + s.body.length, 0);
    const id = randomUUID();
    const uploadedAt = new Date().toISOString();
    const policy: Policy = {
      id,
      integratorId,
      name: dto.name.trim(),
      source: dto.source.trim(),
      version: dto.version?.trim() || undefined,
      scope: dto.scope?.trim() || undefined,
      sections,
      sectionCount: sections.length,
      sizeBytes,
      uploadedAt,
      uploadedBy,
    };

    if (this.db) {
      await this.db.insert(policiesTable).values({
        id,
        integratorId,
        name: policy.name,
        source: policy.source,
        version: policy.version ?? null,
        scope: policy.scope ?? null,
        sections,
        sizeBytes,
        uploadedAt: new Date(uploadedAt),
        uploadedBy: uploadedBy ?? null,
      });
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      arr.push(policy);
      this.memByIntegrator.set(integratorId, arr);
    }
    return policy;
  }

  async remove(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      const result = await this.db
        .delete(policiesTable)
        .where(and(eq(policiesTable.integratorId, integratorId), eq(policiesTable.id, id)))
        .returning({ id: policiesTable.id });
      return result.length > 0;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const idx = arr.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    this.memByIntegrator.set(integratorId, arr);
    return true;
  }

  /**
   * Score each policy section by token overlap with the query signals
   * and return the top matches with a short snippet, for the agentic
   * engine to cite. Pure keyword overlap — deliberately simple,
   * deterministic and CPU-only (no embeddings, no PHI). Runs in memory
   * over the integrator's policies (small list, larger per-section text).
   */
  async findRelevant(
    integratorId: string,
    signals: RelevanceSignals,
    limit = 3,
  ): Promise<PolicyMatch[]> {
    const terms = tokeniseQuery(signals);
    if (!terms.length) return [];

    let policies: Policy[] = [];
    if (this.db) {
      const rows = await this.db
        .select()
        .from(policiesTable)
        .where(eq(policiesTable.integratorId, integratorId));
      policies = rows.map(rowToPolicy);
    } else {
      policies = this.memByIntegrator.get(integratorId) ?? [];
    }
    if (!policies.length) return [];

    const matches: PolicyMatch[] = [];
    for (const policy of policies) {
      for (const section of policy.sections) {
        const score = scoreSection(section.body, terms);
        if (score <= 0) continue;
        matches.push({
          policyId: policy.id,
          name: policy.name,
          source: policy.source,
          version: policy.version,
          sectionTitle: section.title,
          snippet: snippetFor(section.body, terms),
          score,
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
  }
}

function toSummary(p: Policy): PolicySummary {
  const { integratorId: _i, uploadedBy: _u, sections: _s, ...rest } = p;
  void _i;
  void _u;
  void _s;
  return rest;
}

function rowToPolicy(row: typeof policiesTable.$inferSelect): Policy {
  const sections = (row.sections as PolicySection[] | null) ?? [];
  return {
    id: row.id,
    integratorId: row.integratorId,
    name: row.name,
    source: row.source,
    version: row.version ?? undefined,
    scope: row.scope ?? undefined,
    sections,
    sectionCount: sections.length,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedBy: row.uploadedBy ?? undefined,
  };
}

function rowToSummary(row: typeof policiesTable.$inferSelect): PolicySummary {
  const sections = (row.sections as PolicySection[] | null) ?? [];
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    version: row.version ?? undefined,
    scope: row.scope ?? undefined,
    sectionCount: sections.length,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

function normaliseSections(dto: PolicyCreateDto): PolicySection[] {
  if (dto.sections?.length) {
    return dto.sections
      .filter((s) => s && (s.body ?? '').trim().length > 0)
      .map((s) => ({ title: s.title?.trim() || undefined, body: s.body.trim() }));
  }
  const text = (dto.text ?? '').trim();
  if (!text) return [];
  return [{ body: text }];
}

function tokeniseQuery(signals: RelevanceSignals): string[] {
  const raw = [
    signals.question ?? '',
    ...(signals.medications ?? []),
    ...(signals.diagnoses ?? []),
    ...(signals.allergies ?? []),
  ].join(' ');
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreSection(body: string, terms: string[]): number {
  const lower = body.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (lower.includes(t)) score += 1;
  }
  return score;
}

function snippetFor(body: string, terms: string[]): string {
  const lower = body.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - 60);
      const end = Math.min(body.length, i + 180);
      const head = start === 0 ? '' : '… ';
      const tail = end === body.length ? '' : ' …';
      return head + body.slice(start, end).trim() + tail;
    }
  }
  return body.slice(0, 200).trim();
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'not',
  'but',
  'from',
  'into',
  'when',
  'then',
  'than',
  'use',
  'any',
  'all',
  'can',
  'may',
  'should',
  'shall',
  'must',
  'will',
  'would',
]);
