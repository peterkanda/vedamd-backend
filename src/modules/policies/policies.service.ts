import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
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
 * Per-integrator policy store. In-memory + JSON-on-disk persistence
 * (under `data/policies/<integratorId>.json`). No database migration
 * required; the file is the source of truth for dev/sandbox.
 *
 * Policies are integrator-scoped clinical SOPs / standards (JCI, ISO,
 * WHO position papers, NICE summaries, company guidelines). They are
 * never global, never carry patient identity, and never logged.
 */
@Injectable()
export class PoliciesService implements OnModuleInit {
  private readonly nestLogger = new Logger(PoliciesService.name);
  private readonly byIntegrator = new Map<string, Policy[]>();
  private readonly dataDir = resolve(process.cwd(), 'data', 'policies');

  onModuleInit(): void {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.dataDir)) return;
    const files = readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const integratorId = f.replace(/\.json$/, '');
        const arr = JSON.parse(readFileSync(resolve(this.dataDir, f), 'utf8')) as Policy[];
        this.byIntegrator.set(integratorId, arr);
      } catch (err) {
        this.nestLogger.warn(`Failed to load policies file ${f}: ${(err as Error).message}`);
      }
    }
    const total = [...this.byIntegrator.values()].reduce((n, a) => n + a.length, 0);
    if (total)
      this.nestLogger.log(
        `Loaded ${total} policy/-ies across ${this.byIntegrator.size} integrator(s).`,
      );
  }

  private persist(integratorId: string): void {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    const arr = this.byIntegrator.get(integratorId) ?? [];
    writeFileSync(resolve(this.dataDir, `${integratorId}.json`), JSON.stringify(arr, null, 2));
  }

  list(integratorId: string): PolicySummary[] {
    const arr = this.byIntegrator.get(integratorId) ?? [];
    return arr.map(toSummary);
  }

  get(integratorId: string, id: string): Policy | null {
    return (this.byIntegrator.get(integratorId) ?? []).find((p) => p.id === id) ?? null;
  }

  create(integratorId: string, dto: PolicyCreateDto, uploadedBy?: string): Policy {
    const sections = normaliseSections(dto);
    const sizeBytes = sections.reduce((n, s) => n + s.body.length, 0);
    const policy: Policy = {
      id: randomUUID(),
      integratorId,
      name: dto.name.trim(),
      source: dto.source.trim(),
      version: dto.version?.trim() || undefined,
      scope: dto.scope?.trim() || undefined,
      sections,
      sectionCount: sections.length,
      sizeBytes,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    };
    const arr = this.byIntegrator.get(integratorId) ?? [];
    arr.push(policy);
    this.byIntegrator.set(integratorId, arr);
    this.persist(integratorId);
    return policy;
  }

  remove(integratorId: string, id: string): boolean {
    const arr = this.byIntegrator.get(integratorId) ?? [];
    const idx = arr.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    this.byIntegrator.set(integratorId, arr);
    try {
      this.persist(integratorId);
      if (arr.length === 0) {
        // Tidy up: remove the empty file.
        const path = resolve(this.dataDir, `${integratorId}.json`);
        if (existsSync(path)) unlinkSync(path);
      }
    } catch {
      /* fall through */
    }
    return true;
  }

  /**
   * Score each policy section by token overlap with the query signals
   * and return the top matches with a short snippet, for the agentic
   * engine to cite. Pure keyword overlap — deliberately simple,
   * deterministic, and CPU-only (no embeddings, no PHI).
   */
  findRelevant(integratorId: string, signals: RelevanceSignals, limit = 3): PolicyMatch[] {
    const arr = this.byIntegrator.get(integratorId) ?? [];
    if (!arr.length) return [];
    const terms = tokeniseQuery(signals);
    if (!terms.length) return [];

    const matches: PolicyMatch[] = [];
    for (const policy of arr) {
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
