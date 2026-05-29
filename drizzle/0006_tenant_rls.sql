-- Row-level security for multi-tenant isolation.
--
-- Each policy is null-safe: when the request has NOT set the
-- `app.integrator_id` GUC, the policy permits the row (the existing
-- application-layer integrator_id filtering still applies, so enabling
-- this migration cannot break running services). When a request DOES
-- set the GUC (via the withTenant() helper), the database enforces that
-- only the tenant's own rows are visible/writable — defence in depth.
--
-- FORCE ensures the policy applies even when the app connects as the
-- table owner. Once every tenant query path sets the GUC (and a
-- dedicated non-owner role is in use), the `IS NULL` escape clause can
-- be dropped in a follow-up migration to make isolation mandatory.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "api_keys" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "integration_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "integration_log" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "policies" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "custom_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "custom_rules" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "notification_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_channels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notification_channels" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "clinical_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinical_audits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "clinical_audits" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "sql_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sql_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sql_connections" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "sql_named_queries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sql_named_queries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sql_named_queries" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "cds_card_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cds_card_feedback" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cds_card_feedback" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id = current_setting('app.integrator_id', true));--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "usage_events" USING (current_setting('app.integrator_id', true) IS NULL OR integrator_id IS NULL OR integrator_id = current_setting('app.integrator_id', true)) WITH CHECK (current_setting('app.integrator_id', true) IS NULL OR integrator_id IS NULL OR integrator_id = current_setting('app.integrator_id', true));
