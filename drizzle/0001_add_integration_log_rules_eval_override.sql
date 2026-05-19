ALTER TABLE "integration_log" ADD COLUMN "rules_evaluated" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_log" ADD COLUMN "override_reason_code" text;