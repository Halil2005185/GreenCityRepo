CREATE TYPE "outbox_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_key" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING'::"outbox_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_sent_consistency" CHECK (("status" = 'SENT') = ("sent_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "outbox_jobs_claim_idx" ON "outbox_jobs" ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_jobs_recipient_idx" ON "outbox_jobs" ("recipient");