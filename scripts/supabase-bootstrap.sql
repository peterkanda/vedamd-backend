-- VedaMD backend — Supabase structure bootstrap.
--
-- This is the concatenation of drizzle/0000_init.sql through
-- drizzle/0006_tenant_rls.sql, in order, for pasting directly into a
-- fresh Supabase project's SQL Editor (Project → SQL Editor → New query).
--
-- PREFERRED PATH: instead of running this file, point DATABASE_URL (in
-- .env / the DO app secret) at the new Supabase session-pooler
-- connection string and run `npm run db:migrate`. That applies the same
-- migrations AND records them in drizzle's own `drizzle.__drizzle_migrations`
-- bookkeeping table, so future `db:generate`/`db:migrate` runs stay in
-- sync. If you run this SQL file by hand instead, drizzle-kit will not
-- know these migrations were applied — running `db:migrate` afterwards
-- against the same database will try to re-run 0000-0006 and fail on
-- "relation already exists". Only use this file when you cannot reach
-- the DB from the CLI (e.g. sanity-checking structure in the dashboard),
-- and follow it up with `drizzle-kit migrate` using `--force` bookkeeping
-- or by baselining the migrations table by hand before applying any new
-- migration.
--
-- Safe to run once against an empty Supabase database.

-- ============================================================
-- 0000_init
-- ============================================================
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"fingerprint" text NOT NULL,
	"scopes" text[] NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_fingerprint_unique" UNIQUE("fingerprint")
);

CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"tenant_id" text,
	"actor_hash" text,
	"subject_hash" text,
	"rule_id" text,
	"rule_version" text,
	"endpoint" text,
	"status_code" integer,
	"latency_ms" integer,
	"override_reason_code" text,
	"request_id" text,
	"prev_hmac" text,
	"hmac" text NOT NULL
);

CREATE TABLE "integration_log" (
	"request_id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"environment" text NOT NULL,
	"api_key_fingerprint" text NOT NULL,
	"endpoint" text NOT NULL,
	"hook" text,
	"latency_ms" integer NOT NULL,
	"status_code" integer NOT NULL,
	"error_category" text DEFAULT '' NOT NULL,
	"cards_returned_count" integer DEFAULT 0 NOT NULL,
	"card_summaries" text[] DEFAULT '{}' NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_invoked" boolean DEFAULT false NOT NULL,
	"llm_provider" text,
	"override_reported" boolean DEFAULT false NOT NULL
);

CREATE INDEX "idx_api_keys_integrator" ON "api_keys" USING btree ("integrator_id");
CREATE INDEX "idx_audit_events_occurred_at" ON "audit_events" USING btree ("occurred_at");
CREATE INDEX "idx_audit_events_event_type_occurred_at" ON "audit_events" USING btree ("event_type","occurred_at");
CREATE INDEX "idx_integration_log_integrator_ts" ON "integration_log" USING btree ("integrator_id","timestamp");

-- ============================================================
-- 0001_add_integration_log_rules_eval_override
-- ============================================================
ALTER TABLE "integration_log" ADD COLUMN "rules_evaluated" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "integration_log" ADD COLUMN "override_reason_code" text;

-- ============================================================
-- 0002_striped_dark_phoenix
-- ============================================================
CREATE TABLE "custom_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"indicator" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"match" jsonb NOT NULL,
	"card" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);

CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"version" text,
	"scope" text,
	"sections" jsonb NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text
);

CREATE INDEX "idx_custom_rules_integrator" ON "custom_rules" USING btree ("integrator_id");
CREATE INDEX "idx_policies_integrator" ON "policies" USING btree ("integrator_id");

-- ============================================================
-- 0003_futuristic_bullseye
-- ============================================================
CREATE TABLE "clinical_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"connection_id" text NOT NULL,
	"named_query_id" text NOT NULL,
	"query_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_rule_ids" text[] DEFAULT '{}' NOT NULL,
	"policy_ids" text[] DEFAULT '{}' NOT NULL,
	"threshold" jsonb NOT NULL,
	"channel_ids" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"last_run_at" timestamp with time zone
);

CREATE TABLE "notification_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"default_recipient" text,
	"sender_label" text,
	"encrypted_creds" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone
);

CREATE INDEX "idx_clinical_audits_integrator" ON "clinical_audits" USING btree ("integrator_id");
CREATE INDEX "idx_notification_channels_integrator" ON "notification_channels" USING btree ("integrator_id");

-- ============================================================
-- 0004_add_cds_card_feedback
-- ============================================================
CREATE TABLE "cds_card_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"card_uuid" text NOT NULL,
	"rule_id" text,
	"service_id" text NOT NULL,
	"hook" text NOT NULL,
	"outcome" text NOT NULL,
	"override_reason_code" text,
	"override_reason_display" text,
	"user_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sql_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"name" text NOT NULL,
	"dialect" text NOT NULL,
	"encrypted_url" text NOT NULL,
	"ssl" boolean DEFAULT false NOT NULL,
	"max_rows" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone
);

CREATE TABLE "sql_named_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"integrator_id" text NOT NULL,
	"query_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"connection_id" text,
	"sql" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);

CREATE INDEX "idx_cds_card_feedback_integrator" ON "cds_card_feedback" USING btree ("integrator_id");
CREATE INDEX "idx_cds_card_feedback_rule" ON "cds_card_feedback" USING btree ("integrator_id","rule_id");
CREATE INDEX "idx_sql_connections_integrator" ON "sql_connections" USING btree ("integrator_id");
CREATE INDEX "idx_sql_named_queries_integrator" ON "sql_named_queries" USING btree ("integrator_id");

-- ============================================================
-- 0005_lovely_angel
-- ============================================================
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"integrator_id" text,
	"actor_type" text NOT NULL,
	"actor_hash" text,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"category" text DEFAULT 'api' NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"environment" text
);

CREATE INDEX "idx_usage_events_integrator" ON "usage_events" USING btree ("integrator_id","occurred_at");
CREATE INDEX "idx_usage_events_category" ON "usage_events" USING btree ("integrator_id","category");
CREATE INDEX "idx_usage_events_time" ON "usage_events" USING btree ("occurred_at");

-- ============================================================
-- 0006_tenant_rls
--
-- Row-level security for multi-tenant isolation. Each policy is
-- null-safe: when a request has NOT set the `app.integrator_id` GUC,
-- the policy permits the row (application-layer integrator_id
-- filtering still applies). When a request DOES set the GUC (via the
-- withTenant() helper), the database enforces that only the tenant's
-- own rows are visible/writable — defence in depth.
-- ============================================================
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "api_keys" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "integration_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "integration_log" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "policies" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "custom_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "custom_rules" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "notification_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_channels" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notification_channels" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "clinical_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_audits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinical_audits" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "sql_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sql_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sql_connections" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "sql_named_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sql_named_queries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sql_named_queries" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "cds_card_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cds_card_feedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cds_card_feedback" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));

ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "usage_events" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id IS NULL OR integrator_id = current_setting('app.integrator_id', true));
