import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc } from 'drizzle-orm';
import type { AuthenticatedOperator } from '../../common/operator-auth';
import type { AppConfig } from '../../config/configuration';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { contentReviews } from '../../db/schema';
import { loadRxNormQuarantine } from '../cds/normalize/rxnorm-quarantine';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  ApprovalExport,
  ReviewDecisionRecord,
  ReviewFlags,
  ReviewPacket,
  ReviewQueueItem,
  ReviewQueuePage,
  ReviewState,
  SubmitReviewDto,
} from './content-review.types';
import { hasUncappedPerKgDose } from './dose-text-safety';
import {
  CORRECTIONS_DOMAIN,
  correctionConflicts,
  loadCorrectionProposals,
  type CorrectionProposal,
} from './corrections';
import {
  DOMAIN_TIER,
  GovernanceService,
  bundleFileDomain,
  governanceDomain,
} from './governance.service';
import { recordContentHash, recordKey } from './record-hash';

/** FR-024: an approved record needs at least this many distinct named reviewers. */
export const REQUIRED_APPROVALS = 2;

interface IndexedRecord {
  domain: string;
  recordId: string;
  tier: 1 | 2 | 3;
  record: Record<string, unknown>;
  hash: string;
  /** Set when this queue entry is a correction proposal, not a bundle record. */
  proposal?: CorrectionProposal;
}

type Ref = { url?: string; strength?: string };

/** Same rule as scripts/promote-bundle.ts: D-tier (or ungraded) as the only source is not approvable. */
function soleDTier(record: Record<string, unknown>): boolean {
  const tiers = ((record.references as Ref[] | undefined) ?? [])
    .map((r) => (r?.strength ?? '').toUpperCase())
    .filter((s) => s.length === 1);
  return tiers.length === 0 || tiers.every((t) => t === 'D');
}

/**
 * Risk-tiered clinical content review (FR-024 workflow).
 *
 * Reviewers work a queue ordered by clinical risk and record decisions here.
 * Nothing in this service edits the signed bundle: decisions are pinned to a
 * record's content hash and exported for scripts/promote-bundle.ts
 * --from-decisions, which applies them to the NEXT bundle version before it is
 * re-signed. Postgres when DATABASE_URL is set, in-memory otherwise.
 */
@Injectable()
export class ContentReviewService implements OnModuleInit {
  private readonly logger = new Logger(ContentReviewService.name);
  private readonly mem: ReviewDecisionRecord[] = [];
  private indexCache: { version: string; byKey: Map<string, IndexedRecord> } | null = null;
  private quarantinedDrugSlugs = new Set<string>();
  private proposals: CorrectionProposal[] = [];

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly governance: GovernanceService,
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null,
  ) {}

  onModuleInit(): void {
    this.quarantinedDrugSlugs = new Set(loadRxNormQuarantine().entries.map((q) => q.slug));
    const loaded = loadCorrectionProposals();
    this.proposals = loaded.proposals;
    this.indexCache = null;
    if (loaded.rejected) {
      this.logger.warn(`Ignored ${loaded.rejected} malformed correction proposal(s).`);
    }
    if (!this.db) {
      this.logger.warn(
        'Content reviews use an IN-MEMORY store (no DATABASE_URL); decisions are lost on restart.',
      );
    }
    if (!this.reviewerSubs().length) {
      this.logger.warn(
        'CLINICAL_REVIEWER_SUBS is empty — no operator can submit review decisions.',
      );
    }
  }

  /* ── Queue ─────────────────────────────────────────────────────── */

  async queue(
    filter: {
      tier?: number;
      domain?: string;
      state?: ReviewState;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ReviewQueuePage> {
    const decisions = await this.allDecisions();
    const items: ReviewQueueItem[] = [];
    for (const rec of this.index().values()) {
      const status = (rec.record.reviewStatus as string | undefined) ?? 'draft';
      if (status === 'approved' || status === 'deprecated') continue;
      items.push(this.toItem(rec, decisions));
    }
    items.sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.kemlLevel ?? 99) - (b.kemlLevel ?? 99) ||
        a.domain.localeCompare(b.domain) ||
        a.recordId.localeCompare(b.recordId),
    );
    const counts: Record<ReviewState, number> = {
      'needs-review': 0,
      'needs-second-review': 0,
      'changes-requested': 0,
      'ready-to-promote': 0,
    };
    for (const i of items) counts[i.state] += 1;

    const filtered = items.filter(
      (i) =>
        (filter.tier === undefined || i.tier === filter.tier) &&
        (filter.domain === undefined || i.domain === filter.domain) &&
        (filter.state === undefined || i.state === filter.state),
    );
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.min(Math.max(1, filter.limit ?? 50), 500);
    return {
      bundleVersion: this.bundleVersion(),
      total: filtered.length,
      counts,
      items: filtered.slice(offset, offset + limit),
    };
  }

  async packet(domain: string, recordId: string): Promise<ReviewPacket> {
    const rec = this.find(domain, recordId);
    const decisions = await this.allDecisions();
    const mine = decisions
      .filter((d) => d.domain === rec.domain && d.recordId === rec.recordId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => ({ ...d, stale: d.recordHash !== rec.hash }));
    return { ...this.toItem(rec, decisions), record: rec.record, decisions: mine };
  }

  /* ── Decisions ─────────────────────────────────────────────────── */

  async submit(
    dto: SubmitReviewDto,
    operator: AuthenticatedOperator | undefined,
  ): Promise<ReviewDecisionRecord> {
    if (!operator) throw new ForbiddenException('Operator authentication required.');
    if (!operator.viaDevBypass && !this.reviewerSubs().includes(operator.sub)) {
      throw new ForbiddenException(
        'This operator is not a registered clinical reviewer (CLINICAL_REVIEWER_SUBS).',
      );
    }
    if (dto?.decision !== 'approve' && dto?.decision !== 'request-changes') {
      throw new BadRequestException('decision must be "approve" or "request-changes".');
    }
    const role = typeof dto.role === 'string' ? dto.role.trim() : '';
    if (!role || role.length > 100) {
      throw new BadRequestException(
        'role is required (the clinical role you review as, ≤ 100 chars).',
      );
    }
    const notes = typeof dto.notes === 'string' ? dto.notes.trim().slice(0, 2000) : '';
    if (dto.decision === 'request-changes' && !notes) {
      throw new BadRequestException('notes are required when requesting changes.');
    }

    const rec = this.find(dto.domain, dto.recordId);
    if (dto.recordHash !== rec.hash) {
      throw new ConflictException(
        'recordHash does not match the current record content — reload the packet and review again.',
      );
    }
    const status = (rec.record.reviewStatus as string | undefined) ?? 'draft';
    if (status === 'approved' || status === 'deprecated') {
      throw new ConflictException(`Record is already ${status} in this bundle.`);
    }

    const decisions = await this.allDecisions();
    if (dto.decision === 'approve') {
      const blockers = this.approvalBlockers(rec);
      if (blockers.length) throw new ConflictException(`Approval refused: ${blockers.join('; ')}`);
      const latest = this.latestPerReviewer(decisions, rec);
      if (latest.get(operator.sub)?.decision === 'approve') {
        throw new ConflictException('You have already approved this content.');
      }
    }

    const claims = operator.claims ?? {};
    const name =
      (typeof claims.name === 'string' && claims.name.trim()) ||
      (typeof claims.email === 'string' && claims.email.trim()) ||
      operator.sub;
    const row: ReviewDecisionRecord = {
      id: randomUUID(),
      bundleVersion: this.bundleVersion(),
      domain: rec.domain,
      recordId: rec.recordId,
      recordHash: rec.hash,
      decision: dto.decision,
      reviewerSub: operator.sub,
      reviewerName: name,
      reviewerRole: role,
      integratorId: operator.integratorId ?? null,
      viaDevBypass: operator.viaDevBypass,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };
    if (this.db) {
      await this.db.insert(contentReviews).values({
        ...row,
        createdAt: new Date(row.createdAt),
      });
    } else {
      this.mem.push(row);
    }
    return row;
  }

  /**
   * Records (and correction proposals) whose current content has ≥ 2
   * distinct real reviewers approving and no outstanding change request.
   * `approvals` feed `npm run bundle:promote -- --from-decisions`;
   * `corrections` feed `npm run corrections:apply -- --from-decisions`
   * (apply corrections first — a corrected record returns to draft).
   */
  async exportApprovals(): Promise<ApprovalExport> {
    const decisions = await this.allDecisions();
    const approvals: ApprovalExport['approvals'] = [];
    const corrections: ApprovalExport['corrections'] = [];
    for (const rec of this.index().values()) {
      const status = (rec.record.reviewStatus as string | undefined) ?? 'draft';
      if (status === 'approved' || status === 'deprecated') continue;
      if (this.stateOf(rec, decisions).state !== 'ready-to-promote') continue;
      const latest = [...this.latestPerReviewer(decisions, rec).values()].filter(
        (d) => d.decision === 'approve',
      );
      const reviewers = latest.map((d) => ({
        name: d.reviewerName,
        role: d.reviewerRole,
        reviewedAt: d.createdAt,
      }));
      if (rec.proposal) {
        corrections.push({ proposal: rec.proposal, proposalHash: rec.hash, reviewers });
      } else {
        approvals.push({
          domain: rec.domain,
          recordId: rec.recordId,
          recordHash: rec.hash,
          reviewers,
        });
      }
    }
    approvals.sort(
      (a, b) => a.domain.localeCompare(b.domain) || a.recordId.localeCompare(b.recordId),
    );
    corrections.sort((a, b) => a.proposal.id.localeCompare(b.proposal.id));
    return {
      bundleVersion: this.bundleVersion(),
      generatedAt: new Date().toISOString(),
      approvals,
      corrections,
    };
  }

  /* ── Internals ─────────────────────────────────────────────────── */

  private reviewerSubs(): string[] {
    return this.config.get('content.reviewerSubs', { infer: true }) ?? [];
  }

  private bundleVersion(): string {
    return this.knowledge.getInfo().version ?? 'unknown';
  }

  /** Hash every record once per bundle version — the bundle is immutable at runtime. */
  private index(): Map<string, IndexedRecord> {
    const version = this.bundleVersion();
    if (this.indexCache?.version === version) return this.indexCache.byKey;
    const byKey = new Map<string, IndexedRecord>();
    for (const { domain, records } of this.governance.collectDomains()) {
      const file = bundleFileDomain(domain);
      for (const r of records as Record<string, unknown>[]) {
        const recordId = recordKey(r);
        if (!recordId) continue;
        byKey.set(`${file}/${recordId}`, {
          domain: file,
          recordId,
          tier: DOMAIN_TIER[domain] ?? 3,
          record: r,
          hash: recordContentHash(r),
        });
      }
    }
    // Correction proposals are reviewed like records, under their own domain,
    // at the risk tier of the record they would change.
    for (const p of this.proposals) {
      byKey.set(`${CORRECTIONS_DOMAIN}/${p.id}`, {
        domain: CORRECTIONS_DOMAIN,
        recordId: p.id,
        tier: DOMAIN_TIER[governanceDomain(p.domain)] ?? 3,
        record: p as unknown as Record<string, unknown>,
        hash: recordContentHash(p),
        proposal: p,
      });
    }
    this.indexCache = { version, byKey };
    return byKey;
  }

  private find(domain: string, recordId: string): IndexedRecord {
    const rec =
      typeof domain === 'string' && typeof recordId === 'string'
        ? this.index().get(`${domain}/${recordId}`)
        : undefined;
    if (!rec) throw new NotFoundException(`No record ${domain}/${recordId} in the loaded bundle.`);
    return rec;
  }

  private flags(rec: IndexedRecord): ReviewFlags {
    if (rec.proposal) {
      return {
        quarantinedCode: false,
        uncappedPerKgDose: false,
        citationsWithoutUrl: 0,
        soleDTierCitations: false,
      };
    }
    const refs = (rec.record.references as Ref[] | undefined) ?? [];
    return {
      quarantinedCode: rec.domain === 'drugs' && this.quarantinedDrugSlugs.has(rec.recordId),
      uncappedPerKgDose: hasUncappedPerKgDose(rec.record),
      citationsWithoutUrl: refs.filter((r) => !r?.url).length,
      soleDTierCitations: soleDTier(rec.record),
    };
  }

  private approvalBlockers(rec: IndexedRecord): string[] {
    if (rec.proposal) {
      const p = rec.proposal;
      const target = this.index().get(`${p.domain}/${p.recordId}`);
      return correctionConflicts(p, target?.record);
    }
    const f = this.flags(rec);
    const out: string[] = [];
    if (f.quarantinedCode) {
      out.push(
        'RxNorm code is known to be wrong (content/safety/rxnorm-code-audit.md) — correct it first',
      );
    }
    if (f.soleDTierCitations) {
      out.push('only D-tier or ungraded citations — add an authoritative source first');
    }
    return out;
  }

  /** Latest non-dev-bypass decision per reviewer on the record's CURRENT content. */
  private latestPerReviewer(
    decisions: ReviewDecisionRecord[],
    rec: IndexedRecord,
  ): Map<string, ReviewDecisionRecord> {
    const latest = new Map<string, ReviewDecisionRecord>();
    for (const d of decisions) {
      if (d.viaDevBypass || d.domain !== rec.domain || d.recordId !== rec.recordId) continue;
      if (d.recordHash !== rec.hash) continue;
      const prev = latest.get(d.reviewerSub);
      if (!prev || d.createdAt > prev.createdAt) latest.set(d.reviewerSub, d);
    }
    return latest;
  }

  private stateOf(
    rec: IndexedRecord,
    decisions: ReviewDecisionRecord[],
  ): { state: ReviewState; approvals: number } {
    const latest = [...this.latestPerReviewer(decisions, rec).values()];
    const approvals = latest.filter((d) => d.decision === 'approve').length;
    if (latest.some((d) => d.decision === 'request-changes'))
      return { state: 'changes-requested', approvals };
    if (approvals >= REQUIRED_APPROVALS) return { state: 'ready-to-promote', approvals };
    if (approvals > 0) return { state: 'needs-second-review', approvals };
    return { state: 'needs-review', approvals };
  }

  private toItem(rec: IndexedRecord, decisions: ReviewDecisionRecord[]): ReviewQueueItem {
    const r = rec.record;
    const p = rec.proposal;
    const title = p
      ? `${p.domain}/${p.recordId}: ${p.changes
          .map((c) => `${c.field} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
          .join(', ')}`
      : ((r.title as string | undefined) ??
        (r.name as string | undefined) ??
        (r.inn as string | undefined) ??
        rec.recordId);
    const { state, approvals } = this.stateOf(rec, decisions);
    return {
      domain: rec.domain,
      recordId: rec.recordId,
      title,
      tier: rec.tier,
      ...(typeof r.kemlLevel === 'number' ? { kemlLevel: r.kemlLevel } : {}),
      reviewStatus: ((r.reviewStatus as string | undefined) ??
        'draft') as ReviewQueueItem['reviewStatus'],
      recordHash: rec.hash,
      state,
      approvals,
      flags: this.flags(rec),
      approvalBlockers: this.approvalBlockers(rec),
    };
  }

  private async allDecisions(): Promise<ReviewDecisionRecord[]> {
    if (!this.db) return this.mem;
    const rows = await this.db
      .select()
      .from(contentReviews)
      .orderBy(desc(contentReviews.createdAt));
    return rows.map((r) => ({
      id: r.id,
      bundleVersion: r.bundleVersion,
      domain: r.domain,
      recordId: r.recordId,
      recordHash: r.recordHash,
      decision: r.decision as ReviewDecisionRecord['decision'],
      reviewerSub: r.reviewerSub,
      reviewerName: r.reviewerName,
      reviewerRole: r.reviewerRole,
      integratorId: r.integratorId,
      viaDevBypass: r.viaDevBypass,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
