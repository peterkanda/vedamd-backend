/**
 * CDS Hooks 1.0 envelope + VedaMD recommendation metadata.
 * https://cds-hooks.org/specification/current/
 *
 * VedaMD is content-driven, not FHIR-coupled. Payloads are plain JSON;
 * we never parse them as FHIR resources, never store them, never call
 * back to any FHIR server. Callers may include any structure the spec
 * permits — anything we don't use is ignored.
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
  /** Anonymous structured context. We read only non-identifying clinical signals. */
  context: Record<string, unknown>;
  /** Optional caller-supplied data. Treated as opaque JSON; never persisted. */
  prefetch?: Record<string, unknown>;
}

export type CdsIndicator = 'info' | 'warning' | 'critical';

/**
 * Coded clinical reference attached to a recommendation. Lets
 * downstream systems map a VedaMD card back into their own EHR,
 * billing system or analytics warehouse without text-matching.
 *
 * Use one entry per code; multiple codings per card are common
 * (e.g. an ICD-10, an ICD-11 and a SNOMED CT for the same
 * problem). `system` follows the canonical URI conventions used
 * by HL7 / WHO so the consumer can route by string without us
 * shipping a profile.
 */
export interface CodedReference {
  /**
   * Canonical URI of the terminology. VedaMD supports (but does
   * not require) any of the systems below. Consumers are free to
   * ignore values they don't recognise.
   *
   *   http://hl7.org/fhir/sid/icd-10           — WHO ICD-10
   *   http://id.who.int/icd/release/11/mms      — WHO ICD-11 MMS
   *   http://snomed.info/sct                    — SNOMED CT International
   *   http://loinc.org                          — Regenstrief LOINC
   *   http://whocc.no/atc                       — WHO ATC drug classification
   *   http://www.nlm.nih.gov/research/umls/rxnorm — RxNorm (US NLM)
   *   http://vedamd.io/codesystem/aware         — WHO AWaRe antimicrobial
   *   http://www.ama-assn.org/go/cpt            — AMA CPT procedure codes
   *   http://hl7.org/fhir/sid/ndc               — US NDC
   */
  system: string;
  code: string;
  display?: string;
  /** Optional kind hint — "diagnosis" | "lab" | "drug" | "procedure" | "finding" | "other". */
  kind?: 'diagnosis' | 'lab' | 'drug' | 'procedure' | 'finding' | 'other';
}

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
  /**
   * Editorial review status of the underlying record. Cards generated
   * from `draft` records MUST be visually flagged in the consuming UI
   * — the content has not been formally reviewed by the clinical
   * editorial board. Anti-hallucination guardrail (FR-024).
   */
  reviewStatus?: 'draft' | 'review' | 'approved' | 'deprecated';
  /**
   * Optional coded references attached to the card. May include
   * ICD-10 / ICD-11 (problem), SNOMED CT (clinical finding /
   * procedure), LOINC (lab / observation), RxNorm / ATC (drug),
   * AWaRe (antimicrobial stewardship), or any other system the
   * publisher chooses. Multiple codings per card are expected.
   */
  codings?: CodedReference[];
}

export interface CdsCard {
  uuid?: string;
  summary: string;
  detail?: string;
  indicator: CdsIndicator;
  source: { label: string; url?: string; icon?: string; strength?: 'A' | 'B' | 'C' | 'D' };
  suggestions?: unknown[];
  links?: unknown[];
  /** Non-standard VedaMD extension (FR-009). */
  extension?: {
    'http://vedamd.io/Card/recommendation': VedaMdRecommendationMeta;
    /** Agentic-layer confidence (0-1). Present only on agentic cards. */
    'http://vedamd.io/Card/agentic-confidence'?: number;
    /**
     * Citations with their resolved source-strength tier — surfaced
     * so the frontend can render an A/B/C/D badge next to each one,
     * making trust calibration explicit.
     */
    'http://vedamd.io/Card/citations'?: Array<{
      kind: 'drug' | 'ddi' | 'condition' | 'procedure' | 'rule';
      id: string;
      label: string;
      url?: string;
      strength?: 'A' | 'B' | 'C' | 'D';
    }>;
  };
}

export interface CdsHookResponse {
  cards: CdsCard[];
  systemActions?: unknown[];
}

/**
 * Minimal CapabilityStatement-shaped response used by VedaMD to
 * advertise its stateless, content-driven posture (FR-093).
 * Not a full FHIR CapabilityStatement — we are not a FHIR server
 * (FR-089) and do not require FHIR-shaped input.
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
