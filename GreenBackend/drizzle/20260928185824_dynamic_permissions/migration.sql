CREATE TYPE "override_effect" AS ENUM('GRANT', 'REVOKE');--> statement-breakpoint
CREATE TABLE "membership_capability_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"membership_id" uuid NOT NULL,
	"capability" varchar(64) NOT NULL,
	"effect" "override_effect" NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "office_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "customized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "roles_office_idx" ON "roles" ("office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_capability_overrides_unique" ON "membership_capability_overrides" ("membership_id","capability");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "membership_capability_overrides" ADD CONSTRAINT "membership_capability_overrides_52k4mU0vsCho_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_capability_overrides" ADD CONSTRAINT "membership_capability_overrides_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;