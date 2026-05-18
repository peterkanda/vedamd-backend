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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX "idx_api_keys_integrator" ON "api_keys" USING btree ("integrator_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_occurred_at" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_event_type_occurred_at" ON "audit_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_integration_log_integrator_ts" ON "integration_log" USING btree ("integrator_id","timestamp");