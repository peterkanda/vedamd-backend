import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { emptyBundle, loadBundleFromDisk } from './bundle-loader';
import type { BundleInfo, LoadedBundle } from './knowledge.types';
import type { CdsRule, ConditionGuidance } from '../conditions/conditions.types';
import type { DrugInteraction, DrugRecord } from '../drugs/drugs.types';
import type { ProcedureGuidance } from '../procedures/procedures.types';
import type { AppConfig } from '../../config/configuration';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';

/**
 * SRS §6.3.2 — Knowledge Content Service.
 *
 * Single source of truth for clinical content at runtime. Content
 * lives on disk as a signed bundle (manifest.json + manifest.sig +
 * public-key.pem + one JSON file per domain). The runtime verifies
 * the Ed25519 signature on the manifest and every file's SHA-256
 * before exposing any record (FR-024, FR-025).
 *
 * Domain services (Conditions / Drugs / Procedures) pull their data
 * from here at module init; they no longer carry their own seed
 * arrays.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly nestLogger = new Logger(KnowledgeService.name);
  private bundle: LoadedBundle = emptyBundle('missing');

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {}

  onModuleInit(): void {
    this.loadFromConfig();
  }

  /** Load the bundle configured by `content.bundleDir`. */
  loadFromConfig(): void {
    const dir = this.config.get('content.bundleDir', { infer: true });
    const strict = this.config.get('content.strictVerification', { infer: true });
    const requireApproved = this.config.get('content.requireApproved', { infer: true });
    this.bundle = loadBundleFromDisk(dir, { strict, requireApproved });
    if (!this.config.get('content.snomedEnabled', { infer: true })) {
      this.hideSnomed();
    }
    const stats = this.bundle.info.contentStats;
    if (this.bundle.info.verified) {
      this.nestLogger.log(
        `Loaded signed bundle ${this.bundle.info.version} (${this.bundle.info.files.length} files, ${stats?.totalRecords ?? 0} records: ${stats?.byStatus.approved ?? 0} approved / ${stats?.byStatus.draft ?? 0} draft / ${stats?.byStatus.review ?? 0} review / ${stats?.byStatus.deprecated ?? 0} deprecated) signed by ${this.bundle.info.signedBy}.`,
      );
    } else {
      this.nestLogger.warn(
        `Content bundle NOT verified (${this.bundle.info.verificationStatus}). Domain services will return empty results.`,
      );
    }
    this.log.info('bundle_loaded', {
      bundle_version: this.bundle.info.version,
      bundle_verified: this.bundle.info.verified,
      bundle_status: this.bundle.info.verificationStatus,
      bundle_files: this.bundle.info.files.length,
    });
  }

  /** Inject a pre-loaded bundle. Used by unit tests; not called in prod. */
  loadFromMemory(bundle: LoadedBundle): void {
    this.bundle = bundle;
  }

  /**
   * Hide SNOMED CT from every runtime surface while keeping the data in
   * the signed bundle as future provision. SNOMED CT redistribution
   * requires an affiliate licence; until one is in place
   * (`CONTENT_SNOMED_ENABLED=true`) we drop the SNOMED code system,
   * the per-record `snomed` cross-references, and any SNOMED card
   * codings. No other terminology is affected.
   */
  private hideSnomed(): void {
    const SNOMED = 'http://snomed.info/sct';
    const term = this.bundle.terminology;
    if (term?.codeSystems) {
      term.codeSystems = term.codeSystems.filter((cs) => cs.system !== SNOMED);
    }
    for (const c of this.bundle.conditions) delete (c as { snomed?: unknown }).snomed;
    for (const d of this.bundle.drugs) delete (d as { snomed?: unknown }).snomed;
    for (const r of this.bundle.cdsRules) {
      if (r.codings) r.codings = r.codings.filter((co) => co.system !== SNOMED);
    }
    this.nestLogger.log('SNOMED CT hidden at runtime (CONTENT_SNOMED_ENABLED is not true).');
  }

  getInfo(): BundleInfo {
    return this.bundle.info;
  }

  getConditions(): ConditionGuidance[] {
    return this.bundle.conditions;
  }

  getDrugs(): DrugRecord[] {
    return this.bundle.drugs;
  }

  getInteractions(): DrugInteraction[] {
    return this.bundle.interactions;
  }

  getProcedures(): ProcedureGuidance[] {
    return this.bundle.procedures;
  }

  getCdsRules(): CdsRule[] {
    return this.bundle.cdsRules;
  }

  /**
   * Resolve the source-strength tier for a cited bundle record.
   *
   * Looks up the record by (kind, id), walks its references[], and
   * returns the STRONGEST tier present (A > B > C > D). Returns
   * undefined when the record can't be found or has no scored refs.
   *
   * Used by the agentic engine + reference chat to attach a strength
   * badge to every citation it emits, so clinicians see the underlying
   * evidence quality without leaving the card.
   */
  getCitationStrength(
    kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
    id: string,
  ): 'A' | 'B' | 'C' | 'D' | undefined {
    const refs = this.resolveRecordRefs(kind, id);
    if (!refs || refs.length === 0) return undefined;
    let best: 'A' | 'B' | 'C' | 'D' | undefined;
    const rank: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 1, C: 2, D: 3 };
    for (const r of refs) {
      const s = r.strength;
      if (s !== 'A' && s !== 'B' && s !== 'C' && s !== 'D') continue;
      if (best === undefined || rank[s] < rank[best]) best = s;
    }
    return best;
  }

  private resolveRecordRefs(
    kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule',
    id: string,
  ): Array<{ strength?: string }> | undefined {
    if (kind === 'drug') {
      const rec = this.bundle.drugs.find((d) => d.slug === id);
      return rec?.references;
    }
    if (kind === 'condition') {
      const rec = this.bundle.conditions.find((c) => c.slug === id);
      return rec?.references;
    }
    if (kind === 'procedure') {
      const rec = this.bundle.procedures.find((p) => p.slug === id);
      return rec?.references;
    }
    if (kind === 'rule') {
      const rec = this.bundle.cdsRules.find((r) => r.id === id);
      return rec?.references;
    }
    if (kind === 'ddi') {
      // DDIs are keyed as "slugA|slugB"; allow either order.
      const [a, b] = id.split('|');
      const rec = this.bundle.interactions.find(
        (d) => (d.slugA === a && d.slugB === b) || (d.slugA === b && d.slugB === a),
      );
      return rec?.references;
    }
    return undefined;
  }

  getClinicalScores() {
    return this.bundle.clinicalScores;
  }

  getPgxGuidelines() {
    return this.bundle.pgxGuidelines;
  }

  getDrugDiseaseInteractions() {
    return this.bundle.drugDiseaseInteractions;
  }

  getImmunizationSchedule() {
    return this.bundle.immunizationSchedule;
  }

  getAllergyCrossReactivity() {
    return this.bundle.allergyCrossReactivity;
  }

  getNotifiableDiseases() {
    return this.bundle.notifiableDiseases;
  }

  getReferenceRanges() {
    return this.bundle.referenceRanges;
  }

  getAntidotes() {
    return this.bundle.antidotes;
  }

  getToxidromes() {
    return this.bundle.toxidromes;
  }

  getAnticoagulantReversal() {
    return this.bundle.anticoagulantReversal;
  }

  getIvCompatibility() {
    return this.bundle.ivCompatibility;
  }

  getPregnancyLactation() {
    return this.bundle.pregnancyLactation;
  }

  getHepaticDose() {
    return this.bundle.hepaticDose;
  }

  getRenalDose() {
    return this.bundle.renalDose;
  }

  getSymptomTriage() {
    return this.bundle.symptomTriage;
  }

  getClinicalProcedures() {
    return this.bundle.clinicalProcedures;
  }

  getBedsideInterpretation() {
    return this.bundle.bedsideInterpretation;
  }

  getPreventiveCare() {
    return this.bundle.preventiveCare;
  }

  getGrowthDevelopment() {
    return this.bundle.growthDevelopment;
  }

  getTerminology() {
    return this.bundle.terminology;
  }
}
