import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  ContentReviewReport,
  DomainReviewBreakdown,
  Fr024Violation,
  ReviewableRecord,
} from './governance.types';

/**
 * Content-governance reporting.
 *
 * Surfaces the review-status posture of the whole signed bundle — which
 * domains are approved vs draft — so a clinical lead can drive the
 * draft → review → approved workflow with visibility. Also enforces
 * FR-024: an `approved` record MUST carry ≥ 2 reviewers and an
 * approvedAt timestamp; anything claiming approval without them is a
 * governance bug and is reported here (and rejected at sign time).
 *
 * This service NEVER mutates review status — promotion to `approved`
 * requires real named clinical reviewers and happens via the content
 * pipeline, not at runtime.
 */
@Injectable()
export class GovernanceService {
  constructor(private readonly knowledge: KnowledgeService) {}

  report(): ContentReviewReport {
    const domains = this.collectDomains();
    const byDomain: DomainReviewBreakdown[] = [];
    const fr024Violations: Fr024Violation[] = [];
    const totals = { records: 0, approved: 0, review: 0, draft: 0, deprecated: 0 };

    for (const { domain, records } of domains) {
      const b: DomainReviewBreakdown = {
        domain,
        total: 0,
        approved: 0,
        review: 0,
        draft: 0,
        deprecated: 0,
        approvedPct: 0,
      };
      for (const r of records) {
        b.total += 1;
        totals.records += 1;
        const status = r.reviewStatus ?? 'draft';
        if (status === 'approved') {
          b.approved += 1;
          totals.approved += 1;
          const violation = this.checkFr024(domain, r);
          if (violation) fr024Violations.push(violation);
        } else if (status === 'review') {
          b.review += 1;
          totals.review += 1;
        } else if (status === 'deprecated') {
          b.deprecated += 1;
          totals.deprecated += 1;
        } else {
          b.draft += 1;
          totals.draft += 1;
        }
      }
      b.approvedPct = b.total === 0 ? 0 : round1((b.approved / b.total) * 100);
      byDomain.push(b);
    }

    byDomain.sort((a, b) => b.total - a.total);

    return {
      generatedAt: new Date().toISOString(),
      bundleVersion: this.knowledge.getInfo().version ?? 'unknown',
      totals: {
        ...totals,
        approvedPct:
          totals.records === 0 ? 0 : round1((totals.approved / totals.records) * 100),
      },
      byDomain,
      fr024Violations,
    };
  }

  private checkFr024(domain: string, r: ReviewableRecord): Fr024Violation | null {
    const id = r.slug ?? r.id ?? '(unknown)';
    const reviewers = r.reviewers ?? [];
    if (reviewers.length < 2) {
      return { domain, id, reason: `approved record has ${reviewers.length} reviewer(s); FR-024 requires ≥ 2` };
    }
    if (!r.approvedAt) {
      return { domain, id, reason: 'approved record is missing approvedAt timestamp (FR-024)' };
    }
    return null;
  }

  private collectDomains(): Array<{ domain: string; records: ReviewableRecord[] }> {
    const k = this.knowledge;
    const asRecords = (x: unknown): ReviewableRecord[] =>
      (Array.isArray(x) ? x : []) as ReviewableRecord[];
    return [
      { domain: 'conditions', records: asRecords(k.getConditions()) },
      { domain: 'drugs', records: asRecords(k.getDrugs()) },
      { domain: 'drug-interactions', records: asRecords(k.getInteractions()) },
      { domain: 'procedures', records: asRecords(k.getProcedures()) },
      { domain: 'cds-rules', records: asRecords(k.getCdsRules()) },
      { domain: 'clinical-scores', records: asRecords(k.getClinicalScores()) },
      { domain: 'pharmacogenomics', records: asRecords(k.getPgxGuidelines()) },
      { domain: 'drug-disease', records: asRecords(k.getDrugDiseaseInteractions()) },
      { domain: 'immunization', records: asRecords(k.getImmunizationSchedule()) },
      { domain: 'allergy-cross-reactivity', records: asRecords(k.getAllergyCrossReactivity()) },
      { domain: 'notifiable-diseases', records: asRecords(k.getNotifiableDiseases()) },
      { domain: 'reference-ranges', records: asRecords(k.getReferenceRanges()) },
      { domain: 'antidotes', records: asRecords(k.getAntidotes()) },
      { domain: 'toxidromes', records: asRecords(k.getToxidromes()) },
      { domain: 'anticoagulant-reversal', records: asRecords(k.getAnticoagulantReversal()) },
      { domain: 'iv-compatibility', records: asRecords(k.getIvCompatibility()) },
      { domain: 'pregnancy-lactation', records: asRecords(k.getPregnancyLactation()) },
      { domain: 'hepatic-dose', records: asRecords(k.getHepaticDose()) },
      { domain: 'symptom-triage', records: asRecords(k.getSymptomTriage()) },
    ];
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
