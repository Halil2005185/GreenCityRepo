CREATE TYPE "deletion_request_status" AS ENUM('PENDING', 'DONE', 'REJECTED');--> statement-breakpoint
CREATE TABLE "participant_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"participant_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"status" "deletion_request_status" DEFAULT 'PENDING'::"deletion_request_status" NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" uuid,
	"decision_note_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_deletion_requests_decision_consistency" CHECK (("status" = 'PENDING') = ("decided_at" is null)),
	CONSTRAINT "participant_deletion_requests_rejection_has_note" CHECK ("status" <> 'REJECTED' or "decision_note_ar" is not null)
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "participant_deletion_requests_pending_unique" ON "participant_deletion_requests" ("participant_id") WHERE "status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "participant_deletion_requests_initiative_idx" ON "participant_deletion_requests" ("initiative_id","status");--> statement-breakpoint
ALTER TABLE "participant_deletion_requests" ADD CONSTRAINT "participant_deletion_requests_xQiaSfoqrdEq_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participant_deletion_requests" ADD CONSTRAINT "participant_deletion_requests_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participant_deletion_requests" ADD CONSTRAINT "participant_deletion_requests_decided_by_id_users_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_redacted_is_empty" CHECK ("redacted_at" is null or (
        "answers" = '{}'::jsonb
        and "applicant_name_ar" is null
        and "applicant_email" is null
        and "applicant_phone" is null
        and "source_ip_hash" is null
      ));--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_anonymized_is_empty" CHECK ("anonymized_at" is null or (
        "phone" is null
        and "phone_key" is null
        and "email" is null
        and "notes_ar" is null
        and "source_submission_id" is null
      ));