-- Close Supabase's public REST API off from the backend's tables.
--
-- The backend reaches these tables only through its own database role
-- (DATABASE_URL). Supabase, however, grants its public API roles (`anon`,
-- `authenticated`) full rights on every new table in `public`, and the
-- tenant_isolation policies from 0006 admit any caller whose
-- app.integrator_id is unset — which is every request to the REST API. With
-- the publishable key that ships inside the apps, anyone could read and change
-- api_keys, audit_events, clinical_audits and the rest. No client uses these
-- tables through Supabase (the apps only write the vedamd_* analytics tables).
--
-- Guarded on the roles existing, so the migration also runs on plain Postgres
-- (local development, CI) where they do not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      "api_keys", "audit_events", "cds_card_feedback", "clinical_audits",
      "content_reviews", "custom_rules", "device_answer_events", "integration_log",
      "notification_channels", "policies", "sql_connections", "sql_named_queries",
      "usage_events"
    FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE "audit_events_id_seq", "device_answer_events_id_seq", "usage_events_id_seq"
    FROM anon, authenticated;
    -- New tables this role creates in `public` no longer inherit API access.
    -- A table meant for app clients must now GRANT it explicitly (see
    -- vedamd-mobile/docs/supabase-analytics.sql).
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
--> statement-breakpoint
-- The two tables created without row-level security get the same
-- backend-only policy as content_reviews (0010).
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "backend_only" ON "audit_events" USING (current_user NOT IN ('anon', 'authenticated')) WITH CHECK (current_user NOT IN ('anon', 'authenticated'));--> statement-breakpoint
ALTER TABLE "device_answer_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device_answer_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "backend_only" ON "device_answer_events" USING (current_user NOT IN ('anon', 'authenticated')) WITH CHECK (current_user NOT IN ('anon', 'authenticated'));
