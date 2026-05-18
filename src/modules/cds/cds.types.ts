/**
 * CDS Hooks 1.0 + VedaMD extensions.
 * https://cds-hooks.org/specification/current/
 */

export interface CdsServiceDescriptor {
  hook: string;
  title: string;
  description: string;
  id: string;
  prefetch?: Record<string, string>;
}

export interface CdsServicesResponse {
  services: CdsServiceDescriptor[];
}

export interface CdsHookRequest {
  hook: string;
  hookInstance: string;
  fhirServer?: string;
  fhirAuthorization?: Record<string, unknown>;
  context: Record<string, unknown>;
  prefetch?: Record<string, unknown>;
}

export type CdsIndicator = 'info' | 'warning' | 'critical';

/**
 * VedaMD recommendation metadata (FR-009).
 * Every card emitted by the engine carries these alongside the
 * CDS Hooks-standard fields, so consumers can trace every
 * recommendation to a signed, versioned rule.
 */
export interface VedaMdRecommendationMeta {
  ruleId: string;
  ruleVersion: string;
  evidenceLevel: 'A' | 'B' | 'C' | 'D' | 'expert-consensus';
  generatedAt: string;
}

export interface CdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: CdsIndicator;
  source: { label: string; url?: string; icon?: string };
  suggestions?: unknown[];
  links?: unknown[];
  /** Non-standard VedaMD extension (FR-009). */
  extension?: {
    'http://vedamd.io/Card/recommendation': VedaMdRecommendationMeta;
  };
}

export interface CdsHookResponse {
  cards: CdsCard[];
  systemActions?: unknown[];
}

/**
 * Minimal CapabilityStatement-shaped response used by VedaMD to
 * advertise its stateless posture (FR-093). Not a full FHIR
 * CapabilityStatement — we are not a FHIR server (FR-089).
 */
export interface StatelessCapability {
  resourceType: 'CapabilityStatement';
  status: 'active';
  date: string;
  publisher: 'VedaMD';
  kind: 'instance';
  software: { name: 'vedamd-api'; version: string };
  /** Plain-language statement of operating model. */
  description: string;
  /** Machine-readable proof for compliance audits (FR-093). */
  extension: Array<{ url: string; valueBoolean: true }>;
}
