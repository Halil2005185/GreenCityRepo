CREATE TYPE "actor_type" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "audit_severity" AS ENUM('INFO', 'NOTICE', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "role_scope" AS ENUM('STAFF', 'PARTNER');--> statement-breakpoint
CREATE TYPE "session_revoke_reason" AS ENUM('LOGOUT', 'LOGOUT_ALL', 'ROTATED', 'EXPIRED', 'PASSWORD_CHANGED', 'ADMIN_REVOKED', 'REUSE_DETECTED');--> statement-breakpoint
CREATE TYPE "token_purpose" AS ENUM('PASSWORD_RESET', 'EMAIL_VERIFICATION');--> statement-breakpoint
CREATE TYPE "user_kind" AS ENUM('STAFF', 'PARTNER');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"parent_id" uuid,
	"slug" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offices_no_self_parent" CHECK ("parent_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"scope" "role_scope" NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"refresh_token_hash" char(64) NOT NULL,
	"user_agent" varchar(400),
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" "session_revoke_reason",
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_revoked_consistency" CHECK (("revoked_at" is null) = ("revoke_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name_ar" varchar(160) NOT NULL,
	"full_name_en" varchar(160),
	"phone" varchar(32),
	"kind" "user_kind" NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE'::"user_status" NOT NULL,
	"job_title_ar" varchar(160),
	"email_verified_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"requested_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(254) NOT NULL,
	"kind" "user_kind" NOT NULL,
	"full_name_ar" varchar(160),
	"role_id" uuid NOT NULL,
	"office_id" uuid,
	"token_hash" char(64) NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING'::"invitation_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_lowercase" CHECK ("email" = lower("email")),
	CONSTRAINT "invitations_office_matches_kind" CHECK (("kind" = 'STAFF' and "office_id" is not null)
          or ("kind" = 'PARTNER' and "office_id" is null)),
	CONSTRAINT "invitations_accepted_consistency" CHECK (("status" <> 'ACCEPTED')
          or ("accepted_at" is not null and "accepted_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE'::"membership_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_ended_consistency" CHECK (("status" = 'ACTIVE' and "ended_at" is null)
          or ("status" = 'ENDED' and "ended_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_type" "actor_type" DEFAULT 'USER'::"actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"severity" "audit_severity" DEFAULT 'INFO'::"audit_severity" NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"entity_label" varchar(200),
	"summary_ar" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"partner_visible" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(400),
	"request_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "offices_slug_unique" ON "offices" ("slug");--> statement-breakpoint
CREATE INDEX "offices_parent_idx" ON "offices" ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_slug_unique" ON "roles" ("slug");--> statement-breakpoint
CREATE INDEX "roles_scope_idx" ON "roles" ("scope");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_unique" ON "sessions" ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");--> statement-breakpoint
CREATE INDEX "users_kind_status_idx" ON "users" ("kind","status");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_unique" ON "verification_tokens" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_active_unique" ON "verification_tokens" ("user_id","purpose") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE INDEX "verification_tokens_expires_idx" ON "verification_tokens" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_unique" ON "invitations" ("email") WHERE "status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "invitations_status_idx" ON "invitations" ("status");--> statement-breakpoint
CREATE INDEX "invitations_expires_idx" ON "invitations" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_unique" ON "memberships" ("user_id","office_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_primary_unique" ON "memberships" ("user_id") WHERE "is_primary" and "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_office_idx" ON "memberships" ("office_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_parent_id_offices_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "offices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_id_sessions_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_users_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_id_users_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;