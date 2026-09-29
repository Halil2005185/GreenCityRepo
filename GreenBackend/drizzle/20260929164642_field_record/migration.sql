CREATE TABLE "participant_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"participant_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"code" varchar(16) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_certificates_code_format" CHECK ("code" ~ '^[2-9A-HJ-NP-Z]{10}$')
);
--> statement-breakpoint
ALTER TABLE "field_groups" ADD COLUMN "hours_per_day" numeric(3,1);--> statement-breakpoint
ALTER TABLE "field_settings" ADD COLUMN "certificates_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "field_settings" ADD COLUMN "certificate_signer_name_ar" varchar(160);--> statement-breakpoint
ALTER TABLE "field_settings" ADD COLUMN "certificate_signer_title_ar" varchar(160);--> statement-breakpoint
CREATE UNIQUE INDEX "participant_certificates_code_unique" ON "participant_certificates" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_certificates_holder_unique" ON "participant_certificates" ("participant_id","initiative_id");--> statement-breakpoint
ALTER TABLE "participant_certificates" ADD CONSTRAINT "participant_certificates_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participant_certificates" ADD CONSTRAINT "participant_certificates_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_hours_range" CHECK ("hours_per_day" is null
          or ("hours_per_day" > 0 and "hours_per_day" <= 24));