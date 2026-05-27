/**
 * Per-integrator clinical-audit definitions.
 *
 * An audit binds:
 *   - a connector + named query (where to fetch the rows from the
 *     integrator's database — read-only by enforcement),
 *   - the custom-rule IDs to evaluate against each row,
 *   - the policy IDs whose sections should be cited when a row
 *     breaches a rule (anti-hallucination — the audit cites real
 *     policy text, never invented justifications),
 *   - a threshold (% of breaching rows or absolute count) that defines
 *     a "finding worth alerting on",
 *   - a list of notification-channel IDs to dispatch on breach.
 *
 * Audits are run **on demand** only (no scheduler). The developer hits
 * POST /v1/clinical-audits/:id/run, or an external system fires the
 * same endpoint via a CDS service key — the platform never runs audits
 * autonomously.
 *
 * Anonymous-by-design: the run returns a count of breaches + cited
 * policy sections + dispatch outcomes; no patient identifiers ever
 * cross the boundary.
 */

export interface AuditThreshold {
  /** `'absolute'` → trigger when breach count ≥ value. `'percentage'` → trigger when (breach / total) × 100 ≥ value. */
  kind: 'absolute' | 'percentage';
  value: number;
}

export interface AuditSummary {
  id: string;
  name: string;
  description?: string | null;
  connectionId: string;
  namedQueryId: string;
  customRuleIds: string[];
  policyIds: string[];
  channelIds: string[];
  threshold: AuditThreshold;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string | null;
}

export interface AuditCreateDto {
  name: string;
  description?: string;
  connectionId: string;
  namedQueryId: string;
  queryParams?: Record<string, string | number>;
  customRuleIds: string[];
  policyIds?: string[];
  threshold: AuditThreshold;
  channelIds?: string[];
  enabled?: boolean;
}

export interface AuditUpdateDto {
  name?: string;
  description?: string | null;
  queryParams?: Record<string, string | number>;
  customRuleIds?: string[];
  policyIds?: string[];
  threshold?: AuditThreshold;
  channelIds?: string[];
  enabled?: boolean;
}

/** A single row's audit verdict — anonymous (no row identifiers returned). */
export interface AuditRowVerdict {
  /** Stable row index within the result set (NOT a database PK, just position). */
  rowIndex: number;
  /** Rule IDs that matched on this row. */
  breachedRuleIds: string[];
  /** Policy citations for the breaching rules: `[{ policyId, sectionTitle, snippet }]`. */
  policyCitations: Array<{ policyId: string; sectionTitle?: string; snippet: string }>;
}

export interface AuditDispatchOutcome {
  channelId: string;
  /** Provider-reported delivery status. */
  status: string;
  ok: boolean;
  error?: string;
}

export interface AuditRunResult {
  auditId: string;
  ranAt: string;
  /** Total rows the named query returned (no row content disclosed). */
  totalRows: number;
  /** Rows that breached ≥ 1 rule. */
  breachedRows: number;
  /** % breach = breachedRows / totalRows × 100; 0 if totalRows = 0. */
  breachPct: number;
  /** Did the configured threshold trigger? */
  thresholdBreached: boolean;
  /** Per-row breach verdicts. PHI-free. */
  verdicts: AuditRowVerdict[];
  /** Outbound notification outcomes (one per configured channel). */
  dispatches: AuditDispatchOutcome[];
  /** Set when something went wrong before evaluation (e.g. bad query, missing connection). */
  error?: string;
}
