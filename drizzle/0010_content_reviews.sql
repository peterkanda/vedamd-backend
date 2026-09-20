CREATE TABLE "content_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"bundle_version" text NOT NULL,
	"domain" text NOT NULL,
	"record_id" text NOT NULL,
	"record_hash" text NOT NULL,
	"decision" text NOT NULL,
	"reviewer_sub" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"reviewer_role" text NOT NULL,
	"integrator_id" text,
	"via_dev_bypass" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_content_reviews_record" ON "content_reviews" USING btree ("domain","record_id");--> statement-breakpoint
-- Global (not tenant-scoped) review ledger: no tenant_isolation policy. RLS is
-- still enabled so Supabase's public API roles cannot read or write it; the
-- backend's own database role is unaffected.
ALTER TABLE "content_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "backend_only" ON "content_reviews" USING (current_user NOT IN ('anon', 'authenticated')) WITH CHECK (current_user NOT IN ('anon', 'authenticated'));
