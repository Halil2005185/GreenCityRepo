CREATE TABLE "invitation_office_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"invitation_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_office_roles_unique" ON "invitation_office_roles" ("invitation_id","office_id");--> statement-breakpoint
CREATE INDEX "invitation_office_roles_invitation_idx" ON "invitation_office_roles" ("invitation_id");--> statement-breakpoint
ALTER TABLE "invitation_office_roles" ADD CONSTRAINT "invitation_office_roles_invitation_id_invitations_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation_office_roles" ADD CONSTRAINT "invitation_office_roles_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "invitation_office_roles" ADD CONSTRAINT "invitation_office_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT;