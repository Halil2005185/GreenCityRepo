ALTER TABLE "field_groups" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
CREATE INDEX "field_groups_partner_idx" ON "field_groups" ("partner_id");--> statement-breakpoint
ALTER TABLE "field_groups" ADD CONSTRAINT "field_groups_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL;