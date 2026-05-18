/**
 * CDS Hooks 1.0 service descriptor.
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

export interface CdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: CdsIndicator;
  source: { label: string; url?: string; icon?: string };
  suggestions?: unknown[];
  links?: unknown[];
}

export interface CdsHookResponse {
  cards: CdsCard[];
  systemActions?: unknown[];
}
