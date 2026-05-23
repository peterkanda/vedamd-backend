-- Per-integrator clinical policies / standards (JCI, ISO, WHO, NICE,
-- company SOPs). The agentic engine retrieves relevant sections at
-- evaluation time and cites them on returned CDS cards. Never carries
-- patient data — `sections` is the integrator's own policy text only.

CREATE TABLE IF NOT EXISTS "policies" (
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

CREATE INDEX IF NOT EXISTS "idx_policies_integrator" ON "policies" ("integrator_id");
