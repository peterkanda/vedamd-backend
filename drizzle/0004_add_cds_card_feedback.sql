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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX "idx_cds_card_feedback_integrator" ON "cds_card_feedback" USING btree ("integrator_id");--> statement-breakpoint
CREATE INDEX "idx_cds_card_feedback_rule" ON "cds_card_feedback" USING btree ("integrator_id","rule_id");--> statement-breakpoint
CREATE INDEX "idx_sql_connections_integrator" ON "sql_connections" USING btree ("integrator_id");--> statement-breakpoint
CREATE INDEX "idx_sql_named_queries_integrator" ON "sql_named_queries" USING btree ("integrator_id");