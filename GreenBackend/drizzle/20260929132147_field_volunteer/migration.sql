CREATE TABLE "field_settings" (
	"initiative_id" uuid PRIMARY KEY,
	"feedback_form_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"participant_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"first_used_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_links_hash_is_sha256" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "field_groups" ADD COLUMN "contact_phone" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "participant_links_token_unique" ON "participant_links" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_links_active_unique" ON "participant_links" ("participant_id","initiative_id") WHERE "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "participant_links_initiative_idx" ON "participant_links" ("initiative_id");--> statement-breakpoint
ALTER TABLE "field_settings" ADD CONSTRAINT "field_settings_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_settings" ADD CONSTRAINT "field_settings_feedback_form_id_forms_id_fkey" FOREIGN KEY ("feedback_form_id") REFERENCES "forms"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "field_settings" ADD CONSTRAINT "field_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "participant_links" ADD CONSTRAINT "participant_links_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participant_links" ADD CONSTRAINT "participant_links_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "participant_links" ADD CONSTRAINT "participant_links_revoked_by_id_users_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "participant_links" ADD CONSTRAINT "participant_links_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;