CREATE TYPE "field_contact_role" AS ENUM('NAME', 'EMAIL', 'PHONE');--> statement-breakpoint
CREATE TYPE "submission_status" AS ENUM('NEW', 'IN_REVIEW', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"form_version_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"status" "submission_status" DEFAULT 'NEW'::"submission_status" NOT NULL,
	"applicant_name_ar" varchar(160),
	"applicant_email" varchar(254),
	"applicant_phone" varchar(32),
	"source_ip_hash" varchar(64),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "contact_role" "field_contact_role";--> statement-breakpoint
CREATE UNIQUE INDEX "form_fields_contact_role_unique" ON "form_fields" ("version_id","contact_role") WHERE "contact_role" is not null;--> statement-breakpoint
CREATE INDEX "form_submissions_version_idx" ON "form_submissions" ("form_version_id");--> statement-breakpoint
CREATE INDEX "form_submissions_status_idx" ON "form_submissions" ("status");--> statement-breakpoint
CREATE INDEX "form_submissions_email_idx" ON "form_submissions" ("applicant_email");--> statement-breakpoint
CREATE INDEX "form_submissions_submitted_idx" ON "form_submissions" ("submitted_at");--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_version_id_form_versions_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_contact_role_type" CHECK ("contact_role" is null
          or ("contact_role" = 'NAME' and "type" = 'TEXT')
          or ("contact_role" = 'EMAIL' and "type" = 'EMAIL')
          or ("contact_role" = 'PHONE' and "type" = 'PHONE'));