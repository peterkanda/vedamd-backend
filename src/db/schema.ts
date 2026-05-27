import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Operator-only state. No table in this schema is ever permitted to
 * store patient identifiers — that's enforced upstream by the
 * PhiFreeLogger allow-list and the PHI-free design of every
 * service. The columns below describe integrators, the API calls
 * they make, and our own audit trail.
 */

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    /** HMAC-SHA-256 of the secret; the secret itself is never stored. */
    fingerprint: text('fingerprint').notNull().unique(),
    /** Postgres text[] of scope strings. */
    scopes: text('scopes').array().notNull(),
    /** 'sandbox' | 'production' — enforced by app-layer validation. */
    environment: text('environment').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    byIntegrator: index('idx_api_keys_integrator').on(t.integratorId),
  }),
);

export const integrationLog = pgTable(
  'integration_log',
  {
    requestId: text('request_id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    environment: text('environment').notNull(),
    apiKeyFingerprint: text('api_key_fingerprint').notNull(),
    endpoint: text('endpoint').notNull(),
    hook: text('hook'),
    latencyMs: integer('latency_ms').notNull(),
    statusCode: integer('status_code').notNull(),
    errorCategory: text('error_category').notNull().default(''),
    cardsReturnedCount: integer('cards_returned_count').notNull().default(0),
    cardSummaries: text('card_summaries').array().notNull().default([]),
    /** Citations as a JSON array of { label, url }. */
    citations: jsonb('citations').notNull().default([]),
    /** Rules evaluated for this request as a JSON array of
     *  { rule_id, rule_version, fired }. PHI-free by construction. */
    rulesEvaluated: jsonb('rules_evaluated').notNull().default([]),
    llmInvoked: boolean('llm_invoked').notNull().default(false),
    llmProvider: text('llm_provider'),
    overrideReported: boolean('override_reported').notNull().default(false),
    overrideReasonCode: text('override_reason_code'),
  },
  (t) => ({
    byIntegratorTimestamp: index('idx_integration_log_integrator_ts').on(
      t.integratorId,
      t.timestamp,
    ),
  }),
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    eventType: text('event_type').notNull(),
    tenantId: text('tenant_id'),
    /** HMAC-SHA-256 of the actor identifier; raw values never reach this table. */
    actorHash: text('actor_hash'),
    subjectHash: text('subject_hash'),
    ruleId: text('rule_id'),
    ruleVersion: text('rule_version'),
    endpoint: text('endpoint'),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    overrideReasonCode: text('override_reason_code'),
    requestId: text('request_id'),
    /** HMAC of the previous row (or empty for the first). Forms the chain
     *  that lets auditors verify no row has been deleted or modified. */
    prevHmac: text('prev_hmac'),
    /** HMAC over the canonical-JSON of this row's content fields + prevHmac. */
    hmac: text('hmac').notNull(),
  },
  (t) => ({
    byOccurredAt: index('idx_audit_events_occurred_at').on(t.occurredAt),
    byEventTypeOccurredAt: index('idx_audit_events_event_type_occurred_at').on(
      t.eventType,
      t.occurredAt,
    ),
  }),
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
export type IntegrationLogRow = typeof integrationLog.$inferSelect;
export type NewIntegrationLogRow = typeof integrationLog.$inferInsert;

/**
 * Per-integrator uploaded clinical policies / standards (JCI, ISO, WHO,
 * NICE, company SOPs). The agentic engine retrieves relevant sections
 * at evaluation time and cites them on returned CDS cards.
 *
 * NEVER carries patient data — only the integrator's own policy text.
 * The PHI-free logger allow-list and the PoliciesController contract
 * make this structural: the create DTO has no patient fields at all.
 */
export const policies = pgTable(
  'policies',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    /** Standard family: 'JCI' | 'ISO' | 'WHO' | 'NICE' | 'company' | 'other'. */
    source: text('source').notNull(),
    version: text('version'),
    scope: text('scope'),
    /** Array of { title?: string; body: string } objects. */
    sections: jsonb('sections').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: text('uploaded_by'),
  },
  (t) => ({
    byIntegrator: index('idx_policies_integrator').on(t.integratorId),
  }),
);

export type PolicyRow = typeof policies.$inferSelect;
export type NewPolicyRow = typeof policies.$inferInsert;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;

/**
 * Per-integrator custom CDS rules. Developers attach lightweight
 * triggers (medication/diagnosis/lab match) and a recommendation
 * card body; the agentic engine evaluates them alongside the signed
 * deterministic strategies + policy snippets. Integrator-scoped only,
 * never global, never carries patient identity.
 */
export const customRules = pgTable(
  'custom_rules',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** 'critical' | 'warning' | 'info' */
    indicator: text('indicator').notNull(),
    /** Active/disabled flag (kept across edits to preserve history). */
    enabled: boolean('enabled').notNull().default(true),
    /** Match block: { medications?, diagnoses?, allergies?, hooks?, ageMinYears?, ageMaxYears?, pregnant?, eGFRBelow?, labs? } */
    match: jsonb('match').notNull(),
    /** Card to emit when match passes: { summary, detail?, source?, suggestions?, links? } */
    card: jsonb('card').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (t) => ({
    byIntegrator: index('idx_custom_rules_integrator').on(t.integratorId),
  }),
);

export type CustomRuleRow = typeof customRules.$inferSelect;
export type NewCustomRuleRow = typeof customRules.$inferInsert;

/**
 * Per-integrator outbound notification channels. A channel binds a
 * provider (twilio / africastalking / smtp / whatsapp-direct) to the
 * credentials needed to send through it. Credentials are stored as an
 * AEAD-encrypted blob — the raw secrets never touch this table or
 * any application log.
 *
 * Integrator-scoped only; never global; never carries patient identity.
 * Used by audit-finding alerts and any future on-rule-fire notifications.
 */
export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    /** 'twilio-sms' | 'twilio-whatsapp' | 'africastalking-sms' | 'smtp' | 'whatsapp-business' */
    provider: text('provider').notNull(),
    /** Default address (To-number / email / WhatsApp phone) used when an
     *  alert doesn't specify one. Optional — a channel can require an
     *  explicit per-alert recipient. */
    defaultRecipient: text('default_recipient'),
    /** Display label for the From / sender (e.g. "VedaMD Alerts"). */
    senderLabel: text('sender_label'),
    /** AES-GCM-encrypted JSON blob holding provider credentials
     *  (apiKey, apiSecret, accountSid, etc.). Decrypted in-process at
     *  send time; never written to logs. The format is
     *  `<iv-hex>:<ciphertext-hex>:<authTag-hex>`. */
    encryptedCreds: text('encrypted_creds').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    byIntegrator: index('idx_notification_channels_integrator').on(t.integratorId),
  }),
);

export type NotificationChannelRow = typeof notificationChannels.$inferSelect;
export type NewNotificationChannelRow = typeof notificationChannels.$inferInsert;

/**
 * Per-integrator clinical-audit definitions. An audit binds:
 *   - a connector + named query (where to fetch the data),
 *   - the custom rules to evaluate against each row,
 *   - the policy IDs to cite when a row breaches a rule,
 *   - a numeric threshold (% of breaching rows or absolute count) that
 *     defines a "finding worth alerting on",
 *   - a list of notification-channel IDs to dispatch on breach.
 *
 * Audits are run on-demand only (no scheduler) — the developer / system
 * hits POST /v1/clinical-audits/:id/run to execute. Findings + dispatch
 * outcomes are returned in the response and logged to integration-log.
 */
export const clinicalAudits = pgTable(
  'clinical_audits',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Connection ID + named-query ID registered with SqlIngestionService. */
    connectionId: text('connection_id').notNull(),
    namedQueryId: text('named_query_id').notNull(),
    /** Optional bound parameters for the named query (JSON object). */
    queryParams: jsonb('query_params').notNull().default({}),
    /** Array of custom-rule IDs to evaluate against each row. */
    customRuleIds: text('custom_rule_ids').array().notNull().default([]),
    /** Array of policy IDs to cite when a rule breach occurs. */
    policyIds: text('policy_ids').array().notNull().default([]),
    /** Threshold config: { kind: 'absolute' | 'percentage', value: number }. */
    threshold: jsonb('threshold').notNull(),
    /** Array of notification-channel IDs to dispatch on threshold breach. */
    channelIds: text('channel_ids').array().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  },
  (t) => ({
    byIntegrator: index('idx_clinical_audits_integrator').on(t.integratorId),
  }),
);

export type ClinicalAuditRow = typeof clinicalAudits.$inferSelect;
export type NewClinicalAuditRow = typeof clinicalAudits.$inferInsert;

/**
 * Per-integrator SQL connection registrations. Mirrors
 * `SqlConnectionConfig` from agentic/connectors but persisted so
 * developers can register at runtime (env-var-only is the legacy
 * path). The connection URL — which holds the database password —
 * is AEAD-encrypted via the secrets vault with the integratorId as
 * AAD, so a leaked row from tenant A cannot be decrypted as tenant B.
 *
 * Integrator-scoped only; never global; never carries patient data.
 */
export const sqlConnections = pgTable(
  'sql_connections',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    name: text('name').notNull(),
    /** 'postgres' | 'mysql' | 'mssql' | 'oracle' */
    dialect: text('dialect').notNull(),
    /** AEAD-encrypted connection URL — never returned over the API. */
    encryptedUrl: text('encrypted_url').notNull(),
    ssl: boolean('ssl').notNull().default(false),
    maxRows: integer('max_rows').notNull().default(10000),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    byIntegrator: index('idx_sql_connections_integrator').on(t.integratorId),
  }),
);

export type SqlConnectionRow = typeof sqlConnections.$inferSelect;
export type NewSqlConnectionRow = typeof sqlConnections.$inferInsert;

/**
 * Per-integrator named queries. The SELECT is stored as-is (read-only
 * enforcement happens at execution time via the `assertReadOnly()`
 * guard, not at storage time). The declarative mapping is stored as
 * JSONB so the UI can edit it without schema churn.
 *
 * Integrator-scoped only.
 */
export const sqlNamedQueries = pgTable(
  'sql_named_queries',
  {
    id: text('id').primaryKey(),
    integratorId: text('integrator_id').notNull(),
    /** Stable lookup key (e.g. "elderly-polypharmacy"). Surfaced to clinical-audits via this id. */
    queryKey: text('query_key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    connectionId: text('connection_id'),
    sql: text('sql').notNull(),
    /** QueryMapping JSON — patient columns + med/dx/allergy/lab columns. */
    mapping: jsonb('mapping').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (t) => ({
    byIntegrator: index('idx_sql_named_queries_integrator').on(t.integratorId),
  }),
);

export type SqlNamedQueryRow = typeof sqlNamedQueries.$inferSelect;
export type NewSqlNamedQueryRow = typeof sqlNamedQueries.$inferInsert;
