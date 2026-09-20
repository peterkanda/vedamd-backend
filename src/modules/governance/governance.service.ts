import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { DrugCodeIndex } from '../cds/normalize/code-resolver';
import { loadRxNormQuarantine } from '../cds/normalize/rxnorm-quarantine';
import { hasUncappedPerKgDose } from './dose-text-safety';
import { loadCorrectionProposals } from './corrections';
import { recordKey } from './record-hash';
import type {
  ContentReviewReport,
  DomainReviewBreakdown,
  Fr024Violation,
  ReadinessCheck,
  ReadinessReport,
  ReviewableRecord,
} from './governance.types';

/**
 * Clinical-risk tier per domain — the order review effort should follow.
 *   1: content that directly drives a dose, a drug choice or a safety alert
 *   2: clinical guidance and decision aids
 *   3: reference material
 */
export const DOMAIN_TIER: Record<string, 1 | 2 | 3> = {
  drugs: 1,
  'drug-interactions': 1,
  'cds-rules': 1,
  antidotes: 1,
  'anticoagulant-reversal': 1,
  'renal-dose': 1,
  'hepatic-dose': 1,
  'pregnancy-lactation': 1,
  'drug-disease': 1,
  'allergy-cross-reactivity': 1,
  'iv-compatibility': 1,
  conditions: 2,
  procedures: 2,
  'clinical-procedures': 2,
  'symptom-triage': 2,
  'clinical-scores': 2,
  immunization: 2,
  pharmacogenomics: 2,
  toxidromes: 2,
  'reference-ranges': 3,
  'notifiable-diseases': 3,
  'bedside-interpretation': 3,
  'preventive-care': 3,
  'growth-development': 3,
};

/**
 * Governance domain → bundle file (without .json) where the names differ.
 * scripts/promote-bundle.ts addresses records by file domain.
 */
const DOMAIN_FILE: Record<string, string> = {
  'drug-disease': 'drug-disease-interactions',
  immunization: 'immunization-schedule',
};

/** Bundle file domain for a governance domain name. */
export function bundleFileDomain(domain: string): string {
  return DOMAIN_FILE[domain] ?? domain;
}

/** Governance domain name for a bundle file domain (inverse of bundleFileDomain). */
export function governanceDomain(file: string): string {
  return Object.keys(DOMAIN_FILE).find((d) => DOMAIN_FILE[d] === file) ?? file;
}

const fmt = (n: number) => n.toLocaleString('en-US');

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
        approvedPct: totals.records === 0 ? 0 : round1((totals.approved / totals.records) * 100),
      },
      byDomain,
      fr024Violations,
    };
  }

  /**
   * Release readiness for approved-only serving: one pass/warn/block verdict
   * per trust dimension, measured on the loaded signed bundle. Read-only.
   */
  readiness(overlaysDir = resolve(process.cwd(), 'content/overlays')): ReadinessReport {
    const review = this.report();
    const domains = this.collectDomains();
    const checks: ReadinessCheck[] = [];

    // 1. Approval coverage, tier 1 first.
    const tiered = review.byDomain.map((d) => ({ ...d, tier: DOMAIN_TIER[d.domain] ?? 3 }));
    const tier1 = tiered.filter((d) => d.tier === 1);
    const t1Total = tier1.reduce((a, d) => a + d.total, 0);
    const t1Approved = tier1.reduce((a, d) => a + d.approved, 0);
    const { records, approved } = review.totals;
    checks.push({
      id: 'content-approval',
      title: 'Clinical content approved (FR-024 two-reviewer sign-off)',
      status:
        t1Total > 0 && t1Approved === t1Total ? (approved === records ? 'pass' : 'warn') : 'block',
      summary: `${fmt(approved)} of ${fmt(records)} records approved (${review.totals.approvedPct}%); tier 1: ${fmt(t1Approved)} of ${fmt(t1Total)}`,
      action:
        'Review tier-1 domains first (dosing, interactions, CDS rules, antidotes); promote with npm run bundle:promote.',
      metrics: { records, approved, tier1Records: t1Total, tier1Approved: t1Approved },
    });

    // 2. Approved records must carry their reviewers.
    checks.push({
      id: 'fr024',
      title: 'Approved records carry ≥ 2 reviewers and approvedAt',
      status: review.fr024Violations.length ? 'block' : 'pass',
      summary: `${review.fr024Violations.length} FR-024 violation(s)`,
      metrics: { violations: review.fr024Violations.length },
    });

    // 3. Runtime gate.
    const approvedOnly = this.knowledge.requiresApproved();
    checks.push({
      id: 'approved-only-mode',
      title: 'Runtime serves approved content only (CONTENT_REQUIRE_APPROVED)',
      status: approvedOnly ? 'pass' : 'warn',
      summary: approvedOnly ? 'on' : 'off — draft content is being served',
      action: approvedOnly ? undefined : 'Enable once the approval check passes.',
      metrics: { enabled: approvedOnly ? 1 : 0 },
    });

    // 4. Drug codes, exactly as the CDS normalizer indexes them.
    const quarantine = loadRxNormQuarantine();
    const drugs = this.knowledge.getDrugs();
    const stats = new DrugCodeIndex(
      drugs.map((d) => ({
        slug: d.slug,
        inn: d.inn,
        tradeNames: d.tradeNames ?? [],
        atc: d.atc ?? [],
        rxnorm: d.rxnorm,
        snomed: d.snomed as string | string[] | undefined,
      })),
      { quarantine: quarantine.entries },
    ).stats();
    const ambiguous = stats.ambiguous.rxnorm + stats.ambiguous.atc + stats.ambiguous.snomed;
    // KnowledgeService strips SNOMED when CONTENT_SNOMED_ENABLED is off, so a
    // zero there means "not served", not "clean" — say which.
    const snomedServed = drugs.some((d) =>
      Array.isArray(d.snomed) ? d.snomed.length > 0 : Boolean(d.snomed),
    );
    checks.push({
      id: 'drug-codes',
      title: 'Drug codes identify the right molecule',
      status: stats.quarantinedRxNorm > 0 ? 'block' : ambiguous > 0 ? 'warn' : 'pass',
      summary:
        `${stats.quarantinedRxNorm} known-wrong RxNorm code(s) (ignored at runtime); ` +
        `codes shared across molecules — RxNorm ${stats.ambiguous.rxnorm}, ATC ${stats.ambiguous.atc}, ` +
        (snomedServed
          ? `SNOMED ${stats.ambiguous.snomed}`
          : 'SNOMED not served (CONTENT_SNOMED_ENABLED off)'),
      action:
        'Fix codes in the next bundle version from content/safety/rxnorm-code-audit.md; re-run npm run audit:drug-rxnorm.',
      metrics: {
        quarantinedRxNorm: stats.quarantinedRxNorm,
        ambiguousRxNorm: stats.ambiguous.rxnorm,
        ambiguousAtc: stats.ambiguous.atc,
        ambiguousSnomed: stats.ambiguous.snomed,
        drugsWithoutRxNorm: drugs.filter((d) => !d.rxnorm?.trim()).length,
      },
    });

    // 5. Citations a clinician can open.
    let citations = 0;
    let withUrl = 0;
    let perKg = 0;
    for (const { records: rs } of domains) {
      for (const r of rs) {
        for (const c of (r as { references?: { url?: string }[] }).references ?? []) {
          citations += 1;
          if (c?.url) withUrl += 1;
        }
        if (hasUncappedPerKgDose(r)) perKg += 1;
      }
    }
    const missing = citations - withUrl;
    checks.push({
      id: 'citation-urls',
      title: 'Citations link to a verifiable source',
      status: missing ? 'warn' : 'pass',
      summary: `${fmt(missing)} of ${fmt(citations)} citations have no URL`,
      action: missing
        ? 'Work content/safety/citation-link-worklist.md (npm run enrich:citation-links proposes links).'
        : undefined,
      metrics: { citations, withUrl, missing },
    });

    // 6. Per-kg doses without a stated maximum — review workload, mostly not errors.
    checks.push({
      id: 'per-kg-ceilings',
      title: 'Per-kg doses state a maximum (or are confirmed uncapped)',
      status: perKg ? 'warn' : 'pass',
      summary: `${fmt(perKg)} record(s) state a per-kg dose with no maximum`,
      action: perKg
        ? 'Confirm each in content/safety/perkg-dose-review.md during tier-1 review.'
        : undefined,
      metrics: { records: perKg },
    });

    // 7. National overlays (expansion countries; Kenya is the base bundle).
    const countries = existsSync(overlaysDir)
      ? readdirSync(overlaysDir).filter(
          (c) => /^[A-Z]{2}$/.test(c) && existsSync(resolve(overlaysDir, c, 'overlay.json')),
        )
      : [];
    const signedOff = countries.filter((c) => {
      try {
        return (
          JSON.parse(readFileSync(resolve(overlaysDir, c, 'overlay.json'), 'utf8')).signedOff ===
          true
        );
      } catch {
        return false;
      }
    });
    checks.push({
      id: 'country-overlays',
      title: 'Expansion-country overlays clinically signed off',
      status: countries.length && signedOff.length === countries.length ? 'pass' : 'warn',
      summary: `${signedOff.length} of ${countries.length} countries signed off${signedOff.length ? ` (${signedOff.join(', ')})` : ''}`,
      action: 'Does not block a Kenya release; required before serving a country as localized.',
      metrics: { countries: countries.length, signedOff: signedOff.length },
    });

    // 8. Manufacturer labels shipped in the bundle.
    const labels = this.knowledge.getManufacturerLabels() ?? [];
    const draftLabels = labels.filter((l) => l.reviewStatus !== 'approved').length;
    checks.push({
      id: 'manufacturer-labels',
      title: 'Manufacturer labels in the bundle are approved',
      status: draftLabels ? 'warn' : 'pass',
      summary: labels.length
        ? `${fmt(labels.length - draftLabels)} of ${fmt(labels.length)} labels approved`
        : 'none shipped — draft lane only (content/labels/), pending legal sign-off',
      metrics: { labels: labels.length, draft: draftLabels },
    });

    // 9. Machine-verified corrections waiting to be reviewed and applied.
    const { proposals } = loadCorrectionProposals();
    checks.push({
      id: 'corrections',
      title: 'Verified content corrections applied',
      status: proposals.length ? 'warn' : 'pass',
      summary: proposals.length
        ? `${fmt(proposals.length)} correction proposal(s) awaiting review and application to the next bundle`
        : 'no pending correction proposals',
      action: proposals.length
        ? 'Review under domain "corrections" in the review queue; apply with npm run corrections:apply. Worklist: content/corrections/worklist.md.'
        : undefined,
      metrics: { proposals: proposals.length },
    });

    const blockers = checks
      .filter((c) => c.status === 'block')
      .map((c) => `${c.title}: ${c.summary}`);
    return {
      generatedAt: new Date().toISOString(),
      bundleVersion: review.bundleVersion,
      releaseReady: blockers.length === 0,
      checks,
      blockers,
      domains: tiered.sort((a, b) => a.tier - b.tier || b.total - a.total),
    };
  }

  private checkFr024(domain: string, r: ReviewableRecord): Fr024Violation | null {
    const id = recordKey(r) ?? '(unknown)';
    const reviewers = r.reviewers ?? [];
    if (reviewers.length < 2) {
      return {
        domain,
        id,
        reason: `approved record has ${reviewers.length} reviewer(s); FR-024 requires ≥ 2`,
      };
    }
    if (!r.approvedAt) {
      return { domain, id, reason: 'approved record is missing approvedAt timestamp (FR-024)' };
    }
    return null;
  }

  /** Every reviewable domain in the loaded bundle, with its records. */
  collectDomains(): Array<{ domain: string; records: ReviewableRecord[] }> {
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
      { domain: 'renal-dose', records: asRecords(k.getRenalDose()) },
      { domain: 'clinical-procedures', records: asRecords(k.getClinicalProcedures()) },
      { domain: 'bedside-interpretation', records: asRecords(k.getBedsideInterpretation()) },
      { domain: 'preventive-care', records: asRecords(k.getPreventiveCare()) },
      { domain: 'growth-development', records: asRecords(k.getGrowthDevelopment()) },
    ];
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
