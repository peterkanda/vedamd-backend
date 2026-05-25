import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { customRules as customRulesTable } from '../../db/schema';
import type {
  CustomRule,
  CustomRuleCreateDto,
  CustomRuleEvaluation,
  CustomRuleSummary,
  CustomRuleUpdateDto,
} from './custom-rules.types';
import type { CdsCard } from '../cds/cds.types';

interface EvaluationSignals {
  hook?: string;
  medications?: string[];
  diagnoses?: string[];
  allergies?: string[];
  patient?: {
    ageYears?: number;
    pregnant?: boolean;
    eGFR?: number;
  };
  labs?: Array<{ code?: string; name?: string; value: number | string; unit?: string }>;
}

/**
 * Per-integrator custom CDS rule store + matcher.
 *
 * Storage backend:
 *   - With DATABASE_URL: Postgres via drizzle.
 *   - Without: in-memory map (dev / unit tests, never production).
 *
 * Rules are evaluated against a normalised request snapshot — never
 * against patient identifiers — so adding a rule does not change the
 * stateless / no-PHI promise.
 */
@Injectable()
export class CustomRulesService implements OnModuleInit {
  private readonly nestLogger = new Logger(CustomRulesService.name);
  private readonly memByIntegrator = new Map<string, CustomRule[]>();

  constructor(@Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null) {}

  onModuleInit(): void {
    if (this.db) {
      this.nestLogger.log('CustomRulesService using Postgres (drizzle) storage.');
    } else {
      this.nestLogger.warn(
        'CustomRulesService running with IN-MEMORY store (no DATABASE_URL). Rules are lost on restart.',
      );
    }
  }

  async list(integratorId: string): Promise<CustomRuleSummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(customRulesTable)
        .where(eq(customRulesTable.integratorId, integratorId))
        .orderBy(desc(customRulesTable.updatedAt));
      return rows.map(rowToSummary);
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    return arr.map(toSummary);
  }

  async get(integratorId: string, id: string): Promise<CustomRule | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(customRulesTable)
        .where(and(eq(customRulesTable.integratorId, integratorId), eq(customRulesTable.id, id)))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    return arr.find((r) => r.id === id) ?? null;
  }

  async create(
    integratorId: string,
    dto: CustomRuleCreateDto,
    createdBy?: string,
  ): Promise<CustomRule> {
    validateDto(dto);
    const id = randomUUID();
    const now = new Date();
    const record: CustomRule = {
      id,
      integratorId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      indicator: dto.indicator,
      enabled: dto.enabled !== false,
      match: dto.match,
      card: dto.card,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy,
    };
    if (this.db) {
      await this.db.insert(customRulesTable).values({
        id,
        integratorId,
        name: record.name,
        description: record.description ?? null,
        indicator: record.indicator,
        enabled: record.enabled,
        match: record.match as unknown as object,
        card: record.card as unknown as object,
        createdAt: now,
        updatedAt: now,
        createdBy: createdBy ?? null,
      });
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      arr.push(record);
      this.memByIntegrator.set(integratorId, arr);
    }
    return record;
  }

  async update(
    integratorId: string,
    id: string,
    dto: CustomRuleUpdateDto,
  ): Promise<CustomRule | null> {
    const existing = await this.get(integratorId, id);
    if (!existing) return null;
    const merged: CustomRule = {
      ...existing,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
      ...(dto.indicator !== undefined ? { indicator: dto.indicator } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.match !== undefined ? { match: dto.match } : {}),
      ...(dto.card !== undefined ? { card: dto.card } : {}),
      updatedAt: new Date().toISOString(),
    };
    validateDto(merged);
    if (this.db) {
      await this.db
        .update(customRulesTable)
        .set({
          name: merged.name,
          description: merged.description ?? null,
          indicator: merged.indicator,
          enabled: merged.enabled,
          match: merged.match as unknown as object,
          card: merged.card as unknown as object,
          updatedAt: new Date(merged.updatedAt),
        })
        .where(and(eq(customRulesTable.integratorId, integratorId), eq(customRulesTable.id, id)));
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr[idx] = merged;
    }
    return merged;
  }

  async remove(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      const rows = await this.db
        .delete(customRulesTable)
        .where(and(eq(customRulesTable.integratorId, integratorId), eq(customRulesTable.id, id)))
        .returning();
      return rows.length > 0;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  /**
   * Evaluate all enabled rules for an integrator against the supplied
   * normalised clinical signals. Emits one CDS card per matched rule.
   * Always returns — never throws — so a bad rule cannot break agentic
   * evaluation. A malformed rule is silently skipped + warn-logged.
   */
  async evaluate(integratorId: string, signals: EvaluationSignals): Promise<CustomRuleEvaluation[]> {
    if (!integratorId) return [];
    let rules: CustomRule[];
    try {
      if (this.db) {
        const rows = await this.db
          .select()
          .from(customRulesTable)
          .where(
            and(eq(customRulesTable.integratorId, integratorId), eq(customRulesTable.enabled, true)),
          );
        rules = rows.map(rowToRecord);
      } else {
        rules = (this.memByIntegrator.get(integratorId) ?? []).filter((r) => r.enabled);
      }
    } catch (err) {
      this.nestLogger.warn(`custom rule fetch failed: ${(err as Error).message}`);
      return [];
    }

    const out: CustomRuleEvaluation[] = [];
    for (const rule of rules) {
      try {
        if (matches(rule.match, signals)) {
          out.push({ rule: toSummary(rule), card: toCdsCard(rule) });
        }
      } catch (err) {
        this.nestLogger.warn(`custom rule eval skipped (${rule.id}): ${(err as Error).message}`);
      }
    }
    return out;
  }
}

function matches(match: CustomRule['match'], signals: EvaluationSignals): boolean {
  if (match.hooks?.length && !match.hooks.includes(signals.hook ?? '')) return false;
  if (match.medications?.length && !anyTokenHit(match.medications, signals.medications)) return false;
  if (match.diagnoses?.length && !anyTokenHit(match.diagnoses, signals.diagnoses)) return false;
  if (match.allergies?.length && !anyTokenHit(match.allergies, signals.allergies)) return false;

  const age = signals.patient?.ageYears;
  if (match.ageMinYears != null && (age == null || age < match.ageMinYears)) return false;
  if (match.ageMaxYears != null && (age == null || age > match.ageMaxYears)) return false;

  if (match.pregnant === true && signals.patient?.pregnant !== true) return false;
  if (match.pregnant === false && signals.patient?.pregnant === true) return false;

  if (match.eGFRBelow != null) {
    const eGFR = signals.patient?.eGFR;
    if (eGFR == null || eGFR >= match.eGFRBelow) return false;
  }

  if (match.labs?.length) {
    for (const clause of match.labs) {
      const lab = (signals.labs ?? []).find((l) =>
        clause.code
          ? l.code === clause.code
          : clause.nameContains
            ? (l.name ?? '').toLowerCase().includes(clause.nameContains.toLowerCase())
            : false,
      );
      if (!lab) return false;
      const v = typeof lab.value === 'number' ? lab.value : Number(lab.value);
      if (!Number.isFinite(v)) return false;
      if (!compare(v, clause.operator, clause.value)) return false;
    }
  }
  return true;
}

function anyTokenHit(needles: string[], haystack: string[] | undefined): boolean {
  if (!haystack || haystack.length === 0) return false;
  const lower = haystack.map((s) => s.toLowerCase());
  return needles.some((n) => {
    const needle = n.toLowerCase().trim();
    return lower.some((h) => h.includes(needle));
  });
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    default:
      return false;
  }
}

function toCdsCard(rule: CustomRule): CdsCard {
  return {
    summary: rule.card.summary,
    indicator: rule.indicator,
    detail: rule.card.detail,
    source: {
      label: rule.card.sourceLabel ?? `Custom rule: ${rule.name}`,
      url: rule.card.sourceUrl,
    },
    suggestions: rule.card.suggestions,
    links: rule.card.links,
    extension: {
      'http://vedamd.io/Card/recommendation': {
        ruleId: rule.id,
        ruleVersion: 'custom',
        evidenceLevel: 'expert-consensus',
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

function toSummary(r: CustomRule): CustomRuleSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    indicator: r.indicator,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function rowToRecord(r: typeof customRulesTable.$inferSelect): CustomRule {
  return {
    id: r.id,
    integratorId: r.integratorId,
    name: r.name,
    description: r.description ?? undefined,
    indicator: r.indicator as CustomRule['indicator'],
    enabled: r.enabled,
    match: r.match as CustomRule['match'],
    card: r.card as CustomRule['card'],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? undefined,
  };
}

function rowToSummary(r: typeof customRulesTable.$inferSelect): CustomRuleSummary {
  return toSummary(rowToRecord(r));
}

function validateDto(dto: Partial<CustomRuleCreateDto>): void {
  if (dto.name !== undefined && !dto.name.trim()) {
    throw new Error('name is required');
  }
  if (dto.indicator && !['critical', 'warning', 'info'].includes(dto.indicator)) {
    throw new Error('indicator must be one of critical|warning|info');
  }
  const m = dto.match;
  if (m) {
    if (m.ageMinYears != null && m.ageMinYears < 0) throw new Error('ageMinYears must be >= 0');
    if (m.ageMaxYears != null && m.ageMaxYears < 0) throw new Error('ageMaxYears must be >= 0');
    if (m.eGFRBelow != null && m.eGFRBelow <= 0) throw new Error('eGFRBelow must be > 0');
    for (const lab of m.labs ?? []) {
      if (!lab.code && !lab.nameContains) {
        throw new Error('lab clause needs code or nameContains');
      }
      if (!['>', '>=', '<', '<=', '=='].includes(lab.operator)) {
        throw new Error('lab clause operator must be one of >,>=,<,<=,==');
      }
      if (!Number.isFinite(lab.value)) throw new Error('lab clause value must be finite');
    }
    const noMatch =
      !m.medications?.length &&
      !m.diagnoses?.length &&
      !m.allergies?.length &&
      !m.labs?.length &&
      m.ageMinYears == null &&
      m.ageMaxYears == null &&
      m.pregnant == null &&
      m.eGFRBelow == null;
    if (noMatch) throw new Error('match must contain at least one clause');
  }
  if (dto.card !== undefined) {
    if (!dto.card.summary?.trim()) throw new Error('card.summary is required');
  }
}
