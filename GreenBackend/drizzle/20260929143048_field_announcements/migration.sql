CREATE TYPE "field_announcement_audience" AS ENUM('ALL', 'LEADS', 'VOLUNTEERS');--> statement-breakpoint
CREATE TABLE "field_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"group_id" uuid,
	"audience" "field_announcement_audience" DEFAULT 'ALL'::"field_announcement_audience" NOT NULL,
	"title_ar" varchar(120) NOT NULL,
	"body_ar" varchar(600) NOT NULL,
	"targeted_devices" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"subscription_id" uuid,
	"announcement_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING'::"outbox_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_jobs_sent_consistency" CHECK (("status" = 'SENT') = ("sent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"participant_id" uuid,
	"initiative_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" varchar(200) NOT NULL,
	"auth" varchar(100) NOT NULL,
	"user_agent" varchar(300),
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_single_owner" CHECK (num_nonnulls("user_id", "participant_id") = 1),
	CONSTRAINT "push_subscriptions_participant_scope" CHECK (("participant_id" is null) = ("initiative_id" is null)),
	CONSTRAINT "push_subscriptions_endpoint_https" CHECK ("endpoint" like 'https://%')
);
--> statement-breakpoint
CREATE INDEX "field_announcements_initiative_idx" ON "field_announcements" ("initiative_id","created_at");--> statement-breakpoint
CREATE INDEX "field_announcements_group_idx" ON "field_announcements" ("group_id");--> statement-breakpoint
CREATE INDEX "push_jobs_claim_idx" ON "push_jobs" ("status","available_at");--> statement-breakpoint
CREATE INDEX "push_jobs_announcement_idx" ON "push_jobs" ("announcement_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_participant_idx" ON "push_subscriptions" ("participant_id","initiative_id");--> statement-breakpoint
ALTER TABLE "field_announcements" ADD CONSTRAINT "field_announcements_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_announcements" ADD CONSTRAINT "field_announcements_group_id_field_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "field_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_announcements" ADD CONSTRAINT "field_announcements_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "push_jobs" ADD CONSTRAINT "push_jobs_subscription_id_push_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "push_jobs" ADD CONSTRAINT "push_jobs_announcement_id_field_announcements_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "field_announcements"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;