CREATE TABLE "field_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"initiative_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"lead_user_id" uuid,
	"meets_at" timestamp with time zone,
	"meeting_point_ar" varchar(300),
	"instructions_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "field_groups_site_name_unique" ON "field_groups" ("site_id","name_ar");--> statement-breakpoint
CREATE INDEX "field_groups_initiative_idx" ON "field_groups" ("initiative_id");--> statement-breakpoint
CREATE INDEX "field_groups_lead_idx" ON "field_groups" ("lead_user_id");--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_initiative_id_initiatives_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiatives"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_site_id_initiative_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "initiative_sites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_lead_user_id_users_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL;