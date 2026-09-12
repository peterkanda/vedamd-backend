import { Injectable, OnModuleInit } from '@nestjs/common';
import { DrugsService } from '../../drugs/drugs.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import type { CdsHookRequest } from '../cds.types';
import { DrugCodeIndex } from './code-resolver';
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
 * per-request work is map lookups only.
 */
@Injectable()
export class CdsNormalizerService implements OnModuleInit {
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
    this.index = new DrugCodeIndex(
      this.knowledge.getDrugs().map((d) => ({
        slug: d.slug,
        inn: d.inn,
        tradeNames: d.tradeNames ?? [],
        atc: d.atc ?? [],
        rxnorm: d.rxnorm,
        snomed: d.snomed as string | string[] | undefined,
      })),
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
