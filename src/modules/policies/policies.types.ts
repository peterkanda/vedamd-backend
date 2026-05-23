/**
 * Per-integrator clinical policy / standards documents (JCI, ISO, WHO
 * position papers, company SOPs, etc.). The agentic engine retrieves
 * relevant sections at evaluation time so its recommendations can be
 * checked against — and cited to — the integrator's local policies.
 *
 * Stored per-integrator only; never carries patient identity.
 */
export type PolicySource = 'JCI' | 'ISO' | 'WHO' | 'NICE' | 'company' | 'other';

export interface PolicySection {
  /** Optional heading for the section (e.g. "Medication reconciliation"). */
  title?: string;
  /** The text body of the section. */
  body: string;
}

export interface PolicySummary {
  id: string;
  name: string;
  source: PolicySource | string;
  version?: string;
  scope?: string;
  uploadedAt: string;
  sizeBytes: number;
  sectionCount: number;
}

export interface Policy extends PolicySummary {
  integratorId: string;
  uploadedBy?: string;
  sections: PolicySection[];
}

export interface PolicyCreateDto {
  name: string;
  source: string;
  version?: string;
  scope?: string;
  /** Either a structured sections array OR a single `text` body. */
  sections?: PolicySection[];
  text?: string;
}

export interface PolicyMatch {
  policyId: string;
  name: string;
  source: string;
  version?: string;
  sectionTitle?: string;
  snippet: string;
  score: number;
}
