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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX "idx_custom_rules_integrator" ON "custom_rules" USING btree ("integrator_id");--> statement-breakpoint
CREATE INDEX "idx_policies_integrator" ON "policies" USING btree ("integrator_id");