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
--> statement-breakpoint
CREATE INDEX "idx_usage_events_integrator" ON "usage_events" USING btree ("integrator_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_category" ON "usage_events" USING btree ("integrator_id","category");--> statement-breakpoint
CREATE INDEX "idx_usage_events_time" ON "usage_events" USING btree ("occurred_at");