CREATE TYPE "acknowledgement_method" AS ENUM('IN_PERSON', 'EMAIL', 'PORTAL', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "consent_action" AS ENUM('GRANTED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "consent_source" AS ENUM('ADMIN', 'PARTNER_SELF');--> statement-breakpoint
CREATE TYPE "consent_type" AS ENUM('PUBLIC_NAME', 'PUBLIC_LOGO');--> statement-breakpoint
CREATE TYPE "contact_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "interaction_kind" AS ENUM('NOTE', 'CALL', 'EMAIL', 'MEETING', 'MESSAGE', 'DOCUMENT_REQUEST', 'STAGE_CHANGE');--> statement-breakpoint
CREATE TYPE "organization_kind" AS ENUM('COMPANY', 'NGO', 'GOVERNMENT', 'ACADEMIC', 'VOLUNTEER_TEAM', 'COMMUNITY_INITIATIVE', 'DONOR', 'INDIVIDUAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "partner_stage" AS ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'PENDING_APPROVAL', 'ACTIVE', 'ON_HOLD', 'REJECTED', 'ENDED');--> statement-breakpoint
CREATE TYPE "partnership_status" AS ENUM('PROPOSED', 'APPROVED', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "partnership_type" AS ENUM('STRATEGIC', 'EXECUTIVE', 'TECHNICAL', 'MEDIA', 'EVENT');--> statement-breakpoint
CREATE TYPE "support_form" AS ENUM('MORAL_MEDIA', 'COMMUNITY_VOLUNTEERING', 'SPONSORSHIP_LOGISTICS', 'TECHNICAL_ACADEMIC_EXPERTISE', 'ENVIRONMENTAL_AWARENESS', 'INTERNAL_SUSTAINABILITY', 'SPACES_AND_RESOURCES');--> statement-breakpoint
CREATE TABLE "partner_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"partner_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"action" "consent_action" NOT NULL,
	"source" "consent_source" NOT NULL,
	"acted_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"actor_name_ar" varchar(160),
	"note_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"partner_id" uuid NOT NULL,
	"full_name_ar" varchar(160) NOT NULL,
	"job_title_ar" varchar(160),
	"email" varchar(254),
	"phone" varchar(32),
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "contact_status" DEFAULT 'ACTIVE'::"contact_status" NOT NULL,
	"notes_ar" text,
	"linked_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_contacts_email_lowercase" CHECK ("email" is null or "email" = lower("email")),
	CONSTRAINT "partner_contacts_reachable" CHECK ("email" is not null or "phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "partner_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"partner_id" uuid NOT NULL,
	"kind" "interaction_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary_ar" varchar(300) NOT NULL,
	"body_ar" text,
	"recorded_by_id" uuid,
	"partner_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE'::"membership_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_memberships_ended_consistency" CHECK (("status" = 'ACTIVE' and "ended_at" is null)
          or ("status" = 'ENDED' and "ended_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "partner_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"partner_id" uuid NOT NULL,
	"type" "partnership_type" NOT NULL,
	"status" "partnership_status" DEFAULT 'PROPOSED'::"partnership_status" NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"notes_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_partnerships_approval_consistency" CHECK ("status" = 'PROPOSED'
          or ("approved_at" is not null and "approved_by_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80),
	"legal_name_ar" varchar(200) NOT NULL,
	"display_name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200),
	"organization_kind" "organization_kind" NOT NULL,
	"stage" "partner_stage" DEFAULT 'NEW'::"partner_stage" NOT NULL,
	"support_forms" "support_form"[] DEFAULT '{}'::"support_form"[] NOT NULL,
	"website_url" varchar(500),
	"summary_ar" text,
	"account_manager_id" uuid,
	"internal_notes_ar" text,
	"public_name_consent" boolean DEFAULT false NOT NULL,
	"public_name_consent_at" timestamp with time zone,
	"public_logo_consent" boolean DEFAULT false NOT NULL,
	"public_logo_consent_at" timestamp with time zone,
	"approved_by_id" uuid,
	"activated_at" timestamp with time zone,
	"rejection_reason_ar" text,
	"decision_note_ar" text,
	"suspended_at" timestamp with time zone,
	"suspended_by_id" uuid,
	"suspension_reason_ar" text,
	"ended_at" timestamp with time zone,
	"end_reason_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_activation_consistency" CHECK ("stage" <> 'ACTIVE'
          or ("activated_at" is not null and "approved_by_id" is not null)),
	CONSTRAINT "partners_suspension_consistency" CHECK (("suspended_at" is null) = ("suspended_by_id" is null)),
	CONSTRAINT "partners_consent_name_consistency" CHECK ("public_name_consent" = false or "public_name_consent_at" is not null),
	CONSTRAINT "partners_consent_logo_consistency" CHECK ("public_logo_consent" = false or "public_logo_consent_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "charter_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"partner_id" uuid NOT NULL,
	"charter_version_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	"method" "acknowledgement_method" NOT NULL,
	"acknowledged_by_contact_id" uuid,
	"acknowledged_by_name_ar" varchar(160) NOT NULL,
	"acknowledged_by_title_ar" varchar(160),
	"recorded_by_id" uuid,
	"note_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"version" varchar(20) NOT NULL,
	"title_ar" varchar(200) NOT NULL,
	"summary_ar" text,
	"body_ar" text NOT NULL,
	"principles_ar" text[] DEFAULT '{}'::text[] NOT NULL,
	"commitments_ar" text[] DEFAULT '{}'::text[] NOT NULL,
	"effective_from" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charter_versions_published_consistency" CHECK (("published_at" is null) = ("published_by_id" is null))
);
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_office_matches_kind";--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
CREATE INDEX "partner_consent_events_partner_idx" ON "partner_consent_events" ("partner_id","acted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_contacts_primary_unique" ON "partner_contacts" ("partner_id") WHERE "is_primary" and "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "partner_contacts_partner_idx" ON "partner_contacts" ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_interactions_partner_idx" ON "partner_interactions" ("partner_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_memberships_active_user_unique" ON "partner_memberships" ("user_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "partner_memberships_partner_idx" ON "partner_memberships" ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_partnerships_live_unique" ON "partner_partnerships" ("partner_id","type") WHERE "status" <> 'ENDED';--> statement-breakpoint
CREATE INDEX "partner_partnerships_partner_idx" ON "partner_partnerships" ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_partnerships_status_idx" ON "partner_partnerships" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_slug_unique" ON "partners" ("slug") WHERE "slug" is not null;--> statement-breakpoint
CREATE INDEX "partners_stage_idx" ON "partners" ("stage");--> statement-breakpoint
CREATE INDEX "partners_manager_idx" ON "partners" ("account_manager_id");--> statement-breakpoint
CREATE INDEX "partners_display_name_idx" ON "partners" ("display_name_ar");--> statement-breakpoint
CREATE INDEX "charter_acknowledgements_partner_idx" ON "charter_acknowledgements" ("partner_id","acknowledged_at");--> statement-breakpoint
CREATE INDEX "charter_acknowledgements_version_idx" ON "charter_acknowledgements" ("charter_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charter_versions_version_unique" ON "charter_versions" ("version");--> statement-breakpoint
CREATE INDEX "charter_versions_published_idx" ON "charter_versions" ("published_at");--> statement-breakpoint
ALTER TABLE "partner_consent_events" ADD CONSTRAINT "partner_consent_events_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_consent_events" ADD CONSTRAINT "partner_consent_events_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_linked_user_id_users_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_interactions" ADD CONSTRAINT "partner_interactions_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_interactions" ADD CONSTRAINT "partner_interactions_recorded_by_id_users_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partner_memberships" ADD CONSTRAINT "partner_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_memberships" ADD CONSTRAINT "partner_memberships_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_memberships" ADD CONSTRAINT "partner_memberships_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "partner_partnerships" ADD CONSTRAINT "partner_partnerships_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_partnerships" ADD CONSTRAINT "partner_partnerships_approved_by_id_users_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_account_manager_id_users_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_approved_by_id_users_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_suspended_by_id_users_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD CONSTRAINT "charter_acknowledgements_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD CONSTRAINT "charter_acknowledgements_2UGmtPlJkQme_fkey" FOREIGN KEY ("charter_version_id") REFERENCES "charter_versions"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD CONSTRAINT "charter_acknowledgements_x6UimxEFgx9A_fkey" FOREIGN KEY ("acknowledged_by_contact_id") REFERENCES "partner_contacts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD CONSTRAINT "charter_acknowledgements_recorded_by_id_users_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "charter_versions" ADD CONSTRAINT "charter_versions_published_by_id_users_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "charter_versions" ADD CONSTRAINT "charter_versions_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_target_matches_kind" CHECK (("kind" = 'STAFF'
             and "office_id" is not null
             and "partner_id" is null)
          or ("kind" = 'PARTNER'
             and "partner_id" is not null
             and "office_id" is null));