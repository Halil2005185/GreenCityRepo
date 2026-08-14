CREATE TYPE "area_level" AS ENUM('GOVERNORATE', 'CITY', 'DISTRICT', 'NEIGHBORHOOD');--> statement-breakpoint
CREATE TYPE "impact_source" AS ENUM('STAFF_ENTRY', 'PARTNER_SUBMISSION', 'CONTRIBUTION');--> statement-breakpoint
CREATE TYPE "initiative_status" AS ENUM('DRAFT', 'PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "metric_aggregation" AS ENUM('SUM', 'MAX', 'LATEST');--> statement-breakpoint
CREATE TYPE "milestone_status" AS ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "site_status" AS ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "target_rollup" AS ENUM('STRICT', 'ADVISORY', 'NONE');--> statement-breakpoint
CREATE TYPE "template_kind" AS ENUM('MILESTONE', 'TASK');--> statement-breakpoint
CREATE TYPE "work_item_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "work_item_status" AS ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"parent_id" uuid,
	"slug" varchar(80) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"level" "area_level" NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"path" text NOT NULL,
	"center_lat" numeric(9,6),
	"center_lng" numeric(9,6),
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_no_self_parent" CHECK ("parent_id" <> "id"),
	CONSTRAINT "areas_root_is_governorate" CHECK (("parent_id" is null and "level" = 'GOVERNORATE')
          or ("parent_id" is not null and "level" <> 'GOVERNORATE')),
	CONSTRAINT "areas_coordinates_paired" CHECK (("center_lat" is null) = ("center_lng" is null))
);
--> statement-breakpoint
CREATE TABLE "initiative_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"note_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"area_id" uuid,
	"name_ar" varchar(200) NOT NULL,
	"description_ar" text,
	"status" "site_status" DEFAULT 'PLANNED'::"site_status" NOT NULL,
	"lat" numeric(9,6),
	"lng" numeric(9,6),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "initiative_sites_coordinates_paired" CHECK (("lat" is null) = ("lng" is null))
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"program_id" uuid NOT NULL,
	"slug" varchar(80),
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200),
	"summary_ar" text,
	"season" varchar(80),
	"status" "initiative_status" DEFAULT 'DRAFT'::"initiative_status" NOT NULL,
	"target_rollup" "target_rollup" DEFAULT 'ADVISORY'::"target_rollup" NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"launched_by_id" uuid,
	"completed_at" timestamp with time zone,
	"lead_user_id" uuid,
	"internal_notes_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "initiatives_launch_consistency" CHECK ("status" <> 'ACTIVE' or "launched_at" is not null),
	CONSTRAINT "initiatives_date_order" CHECK ("starts_at" is null or "ends_at" is null
          or "ends_at" >= "starts_at")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"default_target_rollup" "target_rollup" DEFAULT 'ADVISORY'::"target_rollup" NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"role_ar" varchar(160),
	"notes_ar" text,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"metric_id" uuid NOT NULL,
	"program_id" uuid,
	"initiative_id" uuid,
	"site_id" uuid,
	"value" numeric(16,4) NOT NULL,
	"source" "impact_source" DEFAULT 'STAFF_ENTRY'::"impact_source" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note_ar" text,
	"recorded_by_id" uuid,
	"verified_at" timestamp with time zone,
	"verified_by_id" uuid,
	"reversal_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_entries_single_scope" CHECK (num_nonnulls("program_id", "initiative_id", "site_id") = 1),
	CONSTRAINT "impact_entries_verified_consistency" CHECK (("verified_at" is null) = ("verified_by_id" is null))
);
--> statement-breakpoint
CREATE TABLE "metric_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"metric_id" uuid NOT NULL,
	"program_id" uuid,
	"initiative_id" uuid,
	"site_id" uuid,
	"value" numeric(16,4) NOT NULL,
	"note_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_targets_single_scope" CHECK (num_nonnulls("program_id", "initiative_id", "site_id") = 1),
	CONSTRAINT "metric_targets_non_negative" CHECK ("value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"unit_ar" varchar(40) NOT NULL,
	"aggregation" "metric_aggregation" DEFAULT 'SUM'::"metric_aggregation" NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_decimals_range" CHECK ("decimals" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"site_id" uuid,
	"title_ar" varchar(200) NOT NULL,
	"description_ar" text,
	"status" "milestone_status" DEFAULT 'PENDING'::"milestone_status" NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_completion_consistency" CHECK (("status" = 'DONE') = ("completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "work_item_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"work_item_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_partner_id" uuid,
	"author_name_ar" varchar(160) NOT NULL,
	"body_ar" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"office_id" uuid,
	"program_id" uuid,
	"initiative_id" uuid,
	"site_id" uuid,
	"partner_id" uuid,
	"milestone_id" uuid,
	"title_ar" varchar(300) NOT NULL,
	"description_ar" text,
	"status" "work_item_status" DEFAULT 'TODO'::"work_item_status" NOT NULL,
	"priority" "work_item_priority" DEFAULT 'NORMAL'::"work_item_priority" NOT NULL,
	"assignee_user_id" uuid,
	"assigned_partner_id" uuid,
	"follow_up_office_id" uuid,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"submitted_for_review_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"blocked_reason_ar" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_single_scope" CHECK (num_nonnulls("office_id", "program_id",
                       "initiative_id", "site_id",
                       "partner_id") = 1),
	CONSTRAINT "work_items_completion_consistency" CHECK (("status" = 'DONE') = ("completed_at" is not null)),
	CONSTRAINT "work_items_blocked_reason" CHECK ("status" <> 'BLOCKED' or "blocked_reason_ar" is not null)
);
--> statement-breakpoint
CREATE TABLE "work_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"program_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "template_kind" NOT NULL,
	"title_ar" varchar(300) NOT NULL,
	"description_ar" text,
	"due_offset_days" integer,
	"default_office_id" uuid,
	"priority" "work_item_priority" DEFAULT 'NORMAL'::"work_item_priority" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_templates_no_self_parent" CHECK ("parent_id" <> "id"),
	CONSTRAINT "work_templates_milestone_is_root" CHECK ("kind" <> 'MILESTONE' or "parent_id" is null)
);
--> statement-breakpoint
ALTER TABLE "partner_partnerships" ADD COLUMN "initiative_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_sibling_slug_unique" ON "areas" ("parent_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "areas_path_unique" ON "areas" ("path");--> statement-breakpoint
CREATE INDEX "areas_parent_idx" ON "areas" ("parent_id");--> statement-breakpoint
CREATE INDEX "areas_level_idx" ON "areas" ("level");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_areas_unique" ON "initiative_areas" ("initiative_id","area_id");--> statement-breakpoint
CREATE INDEX "initiative_areas_area_idx" ON "initiative_areas" ("area_id");--> statement-breakpoint
CREATE INDEX "initiative_sites_initiative_idx" ON "initiative_sites" ("initiative_id");--> statement-breakpoint
CREATE INDEX "initiative_sites_area_idx" ON "initiative_sites" ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiatives_slug_unique" ON "initiatives" ("slug") WHERE "slug" is not null;--> statement-breakpoint
CREATE INDEX "initiatives_program_idx" ON "initiatives" ("program_id");--> statement-breakpoint
CREATE INDEX "initiatives_status_idx" ON "initiatives" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_slug_unique" ON "programs" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_partners_unique" ON "initiative_partners" ("initiative_id","partner_id");--> statement-breakpoint
CREATE INDEX "initiative_partners_partner_idx" ON "initiative_partners" ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "impact_entries_reversal_unique" ON "impact_entries" ("reversal_of_id") WHERE "reversal_of_id" is not null;--> statement-breakpoint
CREATE INDEX "impact_entries_metric_idx" ON "impact_entries" ("metric_id");--> statement-breakpoint
CREATE INDEX "impact_entries_initiative_idx" ON "impact_entries" ("initiative_id");--> statement-breakpoint
CREATE INDEX "impact_entries_site_idx" ON "impact_entries" ("site_id");--> statement-breakpoint
CREATE INDEX "impact_entries_occurred_idx" ON "impact_entries" ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_targets_program_unique" ON "metric_targets" ("program_id","metric_id") WHERE "program_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_targets_initiative_unique" ON "metric_targets" ("initiative_id","metric_id") WHERE "initiative_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_targets_site_unique" ON "metric_targets" ("site_id","metric_id") WHERE "site_id" is not null;--> statement-breakpoint
CREATE INDEX "metric_targets_metric_idx" ON "metric_targets" ("metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_slug_unique" ON "metrics" ("slug");--> statement-breakpoint
CREATE INDEX "milestones_initiative_idx" ON "milestones" ("initiative_id");--> statement-breakpoint
CREATE INDEX "milestones_site_idx" ON "milestones" ("site_id");--> statement-breakpoint
CREATE INDEX "work_item_comments_item_idx" ON "work_item_comments" ("work_item_id","created_at");--> statement-breakpoint
CREATE INDEX "work_items_office_idx" ON "work_items" ("office_id","status");--> statement-breakpoint
CREATE INDEX "work_items_initiative_idx" ON "work_items" ("initiative_id","status");--> statement-breakpoint
CREATE INDEX "work_items_site_idx" ON "work_items" ("site_id");--> statement-breakpoint
CREATE INDEX "work_items_assignee_idx" ON "work_items" ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "work_items_partner_idx" ON "work_items" ("assigned_partner_id","status");--> statement-breakpoint
CREATE INDEX "work_items_due_idx" ON "work_items" ("due_at");--> statement-breakpoint
CREATE INDEX "work_templates_program_idx" ON "work_templates" ("program_id","display_order");--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_areas_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "areas"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "initiative_areas" ADD CONSTRAINT "initiative_areas_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "initiative_areas" ADD CONSTRAINT "initiative_areas_area_id_areas_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "initiative_sites" ADD CONSTRAINT "initiative_sites_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "initiative_sites" ADD CONSTRAINT "initiative_sites_area_id_areas_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_program_id_programs_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_launched_by_id_users_id_fkey" FOREIGN KEY ("launched_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_lead_user_id_users_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "initiative_partners" ADD CONSTRAINT "initiative_partners_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "initiative_partners" ADD CONSTRAINT "initiative_partners_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "initiative_partners" ADD CONSTRAINT "initiative_partners_added_by_id_users_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_partnerships" ADD CONSTRAINT "partner_partnerships_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_metric_id_metrics_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_program_id_programs_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_recorded_by_id_users_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_verified_by_id_users_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "impact_entries" ADD CONSTRAINT "impact_entries_reversal_of_id_impact_entries_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "impact_entries"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "metric_targets" ADD CONSTRAINT "metric_targets_metric_id_metrics_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "metric_targets" ADD CONSTRAINT "metric_targets_program_id_programs_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "metric_targets" ADD CONSTRAINT "metric_targets_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "metric_targets" ADD CONSTRAINT "metric_targets_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_work_items_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_user_id_users_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_partner_id_partners_id_fkey" FOREIGN KEY ("author_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_program_id_programs_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_milestone_id_milestones_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_user_id_users_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assigned_partner_id_partners_id_fkey" FOREIGN KEY ("assigned_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_follow_up_office_id_offices_id_fkey" FOREIGN KEY ("follow_up_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_by_id_users_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "work_templates" ADD CONSTRAINT "work_templates_program_id_programs_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_templates" ADD CONSTRAINT "work_templates_parent_id_work_templates_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "work_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_templates" ADD CONSTRAINT "work_templates_default_office_id_offices_id_fkey" FOREIGN KEY ("default_office_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_partnerships" ADD CONSTRAINT "partner_partnerships_event_needs_initiative" CHECK (("type" = 'EVENT' and "initiative_id" is not null)
          or ("type" <> 'EVENT' and "initiative_id" is null));