import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';

// Kenya-first: the bundle's current jurisdiction. (When the multi-country
// jurisdiction model lands, this reads each record's tagged jurisdiction.)
const DEFAULT_JURISDICTION = 'KE';

/** One content file within a bundle (with its integrity hash + size). */
export interface BundleDomainEntry {
  domain: string;
  sizeBytes: number;
  sha256: string;
}

/** Developer-facing description of a signed knowledge bundle (FR-147). */
export interface BundleCatalogEntry {
  id: string;
  version: string;
  signedBy: string;
  signedAt: string;
  verified: boolean;
  verificationStatus: string;
  signatureAlgorithm: 'ed25519';
  totalRecords: number;
  byStatus: Record<string, number>;
  /** Record counts tallied by clinical-domain tag (e.g. cardiology, analgesia). */
  recordsByClinicalDomain: Record<string, number>;
  /** Sum of content-file sizes (bytes). */
  sizeBytes: number;
  /** Jurisdictions this bundle localizes for (Kenya-first today). */
  jurisdictions: string[];
  domains: BundleDomainEntry[];
}

const CORE_BUNDLE_ID = 'vedamd-core';

/**
 * Catalog of the signed knowledge bundle the platform is currently serving.
 * Built entirely from the verified manifest + content stats exposed by
 * KnowledgeService — no fabricated fields. A single core bundle is served
 * today; the shape is a list so additional/per-jurisdiction bundles slot in.
 */
@Injectable()
export class BundlesService {
  constructor(private readonly knowledge: KnowledgeService) {}

  private coreEntry(): BundleCatalogEntry {
    const info = this.knowledge.getInfo();
    const byDomain = info.contentStats?.byDomain ?? {};
    const byStatus = info.contentStats?.byStatus ?? {};
    const domains: BundleDomainEntry[] = (info.files ?? [])
      .map((f) => ({
        domain: f.name.replace(/\.json$/, ''),
        sizeBytes: f.size,
        sha256: f.sha256,
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain));

    return {
      id: CORE_BUNDLE_ID,
      version: info.version,
      signedBy: info.signedBy,
      signedAt: info.signedAt,
      verified: info.verified,
      verificationStatus: info.verificationStatus,
      signatureAlgorithm: 'ed25519',
      totalRecords: info.contentStats?.totalRecords ?? 0,
      byStatus: { ...byStatus },
      recordsByClinicalDomain: { ...byDomain },
      sizeBytes: domains.reduce((sum, d) => sum + d.sizeBytes, 0),
      jurisdictions: [DEFAULT_JURISDICTION],
      domains,
    };
  }

  /**
   * Catalog query (FR-147). Filters:
   *  - `domain`: restrict the entry's `domains[]` to the named domain.
   *  - `country`: only return bundles that localize for the country
   *    (Kenya today); unknown countries return an empty catalog.
   *  - `locale`: accepted for forward-compatibility (content is currently
   *    served language-agnostically and localized client-side).
   */
  async catalog(
    filter: { domain?: string; locale?: string; country?: string } = {},
  ): Promise<BundleCatalogEntry[]> {
    const entry = this.coreEntry();

    if (filter.country && !entry.jurisdictions.includes(filter.country.toUpperCase())) {
      return [];
    }

    if (filter.domain) {
      const domains = entry.domains.filter((d) => d.domain === filter.domain);
      if (domains.length === 0) return [];
      return [{ ...entry, domains }];
    }

    return [entry];
  }

  /** Latest bundle metadata for a given id (or the core bundle / version). */
  async latest(id: string): Promise<BundleCatalogEntry | null> {
    const entry = this.coreEntry();
    if (id === CORE_BUNDLE_ID || id === entry.version || id === 'current') return entry;
    return null;
  }
}
