CREATE TABLE "device_answer_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_hash" text NOT NULL,
	"question_hash" text NOT NULL,
	"engine" text NOT NULL,
	"model_version" text,
	"content_version" text,
	"grounded" boolean NOT NULL,
	"refused" boolean NOT NULL,
	"complete" boolean NOT NULL,
	"source_ids" text[] DEFAULT '{}' NOT NULL,
	"latency_ms" integer,
	"app_version" text,
	CONSTRAINT "device_answer_events_client_event_id_unique" UNIQUE("client_event_id")
);
--> statement-breakpoint
CREATE INDEX "idx_device_answer_events_occurred_at" ON "device_answer_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_device_answer_events_actor" ON "device_answer_events" USING btree ("actor_hash","occurred_at");