CREATE TYPE "attendance_method" AS ENUM('LEAD_TAP', 'WALK_IN', 'SELF');--> statement-breakpoint
CREATE TYPE "field_member_role" AS ENUM('MEMBER', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "field_rsvp" AS ENUM('UNKNOWN', 'COMING', 'NOT_COMING');--> statement-breakpoint
ALTER TYPE "impact_source" ADD VALUE 'FIELD_ENTRY';--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid,
	"site_id" uuid,
	"work_item_id" uuid,
	"impact_entry_id" uuid,
	"group_id" uuid,
	"url" varchar(500) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"lat" numeric(9,6),
	"lng" numeric(9,6),
	"taken_at" timestamp with time zone,
	"caption_ar" varchar(300),
	"has_people" boolean DEFAULT false NOT NULL,
	"people_consent" boolean DEFAULT false NOT NULL,
	"public_use_allowed" boolean DEFAULT false NOT NULL,
	"public_use_allowed_at" timestamp with time zone,
	"public_use_allowed_by_id" uuid,
	"uploaded_by_user_id" uuid,
	"uploaded_by_participant_id" uuid,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_single_scope" CHECK (num_nonnulls("initiative_id", "site_id",
                       "work_item_id", "impact_entry_id") = 1),
	CONSTRAINT "attachments_coordinates_paired" CHECK (("lat" is null) = ("lng" is null)),
	CONSTRAINT "attachments_size_positive" CHECK ("size_bytes" > 0),
	CONSTRAINT "attachments_public_needs_consent" CHECK (not "public_use_allowed"
          or not "has_people"
          or "people_consent"),
	CONSTRAINT "attachments_public_consistency" CHECK ("public_use_allowed" = ("public_use_allowed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"attended_on" date NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"checked_in_by_id" uuid,
	"method" "attendance_method" NOT NULL,
	"client_id" uuid,
	"undone_at" timestamp with time zone,
	"undone_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" "field_member_role" DEFAULT 'MEMBER'::"field_member_role" NOT NULL,
	"rsvp" "field_rsvp" DEFAULT 'UNKNOWN'::"field_rsvp" NOT NULL,
	"rsvp_at" timestamp with time zone,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name_ar" varchar(160) NOT NULL,
	"phone" varchar(32),
	"email" varchar(254),
	"name_key" varchar(160) NOT NULL,
	"phone_key" varchar(20),
	"source_submission_id" uuid,
	"notes_ar" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_email_lowercase" CHECK ("email" is null or "email" = lower("email"))
);
--> statement-breakpoint
ALTER TABLE "impact_entries" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "impact_entries_client_unique" ON "impact_entries" ("client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_comments_client_unique" ON "work_item_comments" ("client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_client_unique" ON "attachments" ("client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_url_unique" ON "attachments" ("url");--> statement-breakpoint
CREATE INDEX "attachments_site_idx" ON "attachments" ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_work_item_idx" ON "attachments" ("work_item_id");--> statement-breakpoint
CREATE INDEX "attachments_initiative_idx" ON "attachments" ("initiative_id");--> statement-breakpoint
CREATE INDEX "attachments_group_idx" ON "attachments" ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_client_unique" ON "attendance" ("client_id") WHERE "client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_active_unique" ON "attendance" ("group_id","participant_id","attended_on") WHERE "undone_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_group_day_idx" ON "attendance" ("group_id","attended_on");--> statement-breakpoint
CREATE INDEX "attendance_participant_idx" ON "attendance" ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_group_members_unique" ON "field_group_members" ("group_id","participant_id");--> statement-breakpoint
CREATE INDEX "field_group_members_participant_idx" ON "field_group_members" ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_submission_unique" ON "participants" ("source_submission_id") WHERE "source_submission_id" is not null;--> statement-breakpoint
CREATE INDEX "participants_phone_key_idx" ON "participants" ("phone_key");--> statement-breakpoint
CREATE INDEX "participants_email_idx" ON "participants" ("email");--> statement-breakpoint
CREATE INDEX "participants_name_key_idx" ON "participants" ("name_key");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_item_id_work_items_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_impact_entry_id_impact_entries_id_fkey" FOREIGN KEY ("impact_entry_id") REFERENCES "impact_entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_group_id_field_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "field_groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_public_use_allowed_by_id_users_id_fkey" FOREIGN KEY ("public_use_allowed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_participant_id_participants_id_fkey" FOREIGN KEY ("uploaded_by_participant_id") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_group_id_field_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "field_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_checked_in_by_id_users_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_undone_by_id_users_id_fkey" FOREIGN KEY ("undone_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "field_group_members" ADD CONSTRAINT "field_group_members_group_id_field_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "field_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_group_members" ADD CONSTRAINT "field_group_members_participant_id_participants_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_group_members" ADD CONSTRAINT "field_group_members_added_by_id_users_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_source_submission_id_form_submissions_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "form_submissions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;