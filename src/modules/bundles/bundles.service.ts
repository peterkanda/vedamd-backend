import { Injectable } from '@nestjs/common';

export interface BundleCatalogEntry {
  id: string;
  version: string;
  locale: string;
  countryApplicability: string[];
  signedAt: string;
  expiresAt: string;
  sizeBytes: number;
  signatureAlgorithm: 'ed25519';
  /** Signature over the bundle manifest, hex-encoded. */
  signature: string;
}

@Injectable()
export class BundlesService {
  /** Catalog query (FR-147). */
  async catalog(
    _filter: {
      domain?: string;
      locale?: string;
      country?: string;
    } = {},
  ): Promise<BundleCatalogEntry[]> {
    return [];
  }

  /** Latest bundle metadata for a given id. */
  async latest(_id: string): Promise<BundleCatalogEntry | null> {
    return null;
  }
}
