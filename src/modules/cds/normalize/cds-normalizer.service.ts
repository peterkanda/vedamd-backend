import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DrugsService } from '../../drugs/drugs.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import type { CdsHookRequest } from '../cds.types';
import { DrugCodeIndex } from './code-resolver';
import { loadRxNormQuarantine } from './rxnorm-quarantine';
import { normalizeCdsRequest, type NormalizationReport } from './fhir-normalizer';

/**
 * Adapts inbound EMR payloads to VedaMD's flat clinical context.
 *
 * Sits in front of the rule strategies so that OpenMRS/Bahmni, OpenEMR,
 * Epic, Oracle Health and any other CDS Hooks client can post the FHIR
 * they already produce and get cards back — without VedaMD's content
 * becoming FHIR-coupled. Everything downstream of this service still
 * sees the same plain-JSON context it always has.
 *
 * The drug index is built once from the signed bundle at module init;
 * per-request work is map lookups only. Known-bad RxNorm claims from
 * content/safety/rxnorm-quarantine.json are excluded (deny-only).
 */
@Injectable()
export class CdsNormalizerService implements OnModuleInit {
  private readonly logger = new Logger(CdsNormalizerService.name);
  private index = new DrugCodeIndex([]);

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly drugs: DrugsService,
  ) {}

  onModuleInit(): void {
    this.rebuildIndex();
  }

  /** Rebuilds the code index — call after a content bundle swap. */
  rebuildIndex(): void {
    const quarantine = loadRxNormQuarantine();
    // The bundle's RxNorm codes are mostly wrong (content/safety/
    // rxnorm-code-audit.md); the quarantine is what stops them resolving to
    // the wrong drug. Without it, do not match by RxNorm at all — names and
    // ATC still resolve — rather than trust every known-bad code.
    const rxnormTrusted = quarantine.entries.length > 0;
    if (!rxnormTrusted) {
      this.logger.error(
        `RxNorm quarantine unavailable (${quarantine.warning ?? 'empty'}); RxNorm codes are ignored ` +
          'for drug resolution until it is restored.',
      );
    } else if (quarantine.warning) {
      this.logger.warn(`RxNorm quarantine: ${quarantine.warning}`);
    }
    this.index = new DrugCodeIndex(
      this.knowledge.getDrugs().map((d) => ({
        slug: d.slug,
        inn: d.inn,
        tradeNames: d.tradeNames ?? [],
        atc: d.atc ?? [],
        rxnorm: rxnormTrusted ? d.rxnorm : undefined,
        snomed: d.snomed as string | string[] | undefined,
      })),
      { quarantine: quarantine.entries },
    );
    const st = this.index.stats();
    this.logger.log(
      `Drug code index: ${st.quarantinedRxNorm} quarantined RxNorm claim(s) ignored; ` +
        `ambiguous codes not resolved by code — RxNorm ${st.ambiguous.rxnorm}, ` +
        `ATC ${st.ambiguous.atc}, SNOMED ${st.ambiguous.snomed}.`,
    );
  }

  /**
   * Returns the request with FHIR-derived context merged in underneath
   * whatever the caller supplied. Returns the request untouched when
   * the payload carries no FHIR.
   */
  normalize(req: CdsHookRequest): { request: CdsHookRequest; report: NormalizationReport } {
    return normalizeCdsRequest(req, { drugs: this.index });
  }
}
