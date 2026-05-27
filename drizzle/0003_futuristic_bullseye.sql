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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX "idx_clinical_audits_integrator" ON "clinical_audits" USING btree ("integrator_id");--> statement-breakpoint
CREATE INDEX "idx_notification_channels_integrator" ON "notification_channels" USING btree ("integrator_id");