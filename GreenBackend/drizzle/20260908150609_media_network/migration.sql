CREATE TYPE "contact_priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "engagement_horizon" AS ENUM('LONG_TERM', 'SHORT_TERM', 'ONE_OFF');--> statement-breakpoint
CREATE TYPE "media_contact_stage" AS ENUM('NEW', 'CONTACTED', 'INTERESTED', 'COLLABORATING', 'DORMANT', 'DECLINED');--> statement-breakpoint
CREATE TABLE "media_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_media_channels" (
	"partner_id" uuid,
	"channel_id" uuid,
	CONSTRAINT "partner_media_channels_pkey" PRIMARY KEY("partner_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "media_contact_channels" (
	"contact_id" uuid,
	"channel_id" uuid,
	CONSTRAINT "media_contact_channels_pkey" PRIMARY KEY("contact_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "media_contact_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"contact_id" uuid NOT NULL,
	"kind" "interaction_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary_ar" varchar(300) NOT NULL,
	"body_ar" text,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_contact_interactions_completion_needs_due" CHECK ("completed_at" is null or "due_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"job_title_ar" varchar(160),
	"email" varchar(254),
	"phone" varchar(32),
	"profile_url" varchar(500),
	"outlet_name_ar" varchar(200),
	"partner_id" uuid,
	"stage" "media_contact_stage" DEFAULT 'NEW'::"media_contact_stage" NOT NULL,
	"priority" "contact_priority" DEFAULT 'MEDIUM'::"contact_priority" NOT NULL,
	"horizon" "engagement_horizon",
	"relationship_type_id" uuid,
	"account_manager_id" uuid,
	"last_contact_at" timestamp with time zone,
	"internal_notes_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_contacts_email_lowercase" CHECK ("email" is null or "email" = lower("email")),
	CONSTRAINT "media_contacts_reachable" CHECK ("email" is not null
          or "phone" is not null
          or "profile_url" is not null)
);
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "relationship_type_id" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_priority" "contact_priority" DEFAULT 'MEDIUM'::"contact_priority" NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "engagement_horizon" "engagement_horizon";--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "media_channels_slug_unique" ON "media_channels" ("slug");--> statement-breakpoint
CREATE INDEX "media_channels_order_idx" ON "media_channels" ("display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_types_slug_unique" ON "relationship_types" ("slug");--> statement-breakpoint
CREATE INDEX "relationship_types_order_idx" ON "relationship_types" ("display_order");--> statement-breakpoint
CREATE INDEX "partner_media_channels_channel_idx" ON "partner_media_channels" ("channel_id");--> statement-breakpoint
CREATE INDEX "media_contact_channels_channel_idx" ON "media_contact_channels" ("channel_id");--> statement-breakpoint
CREATE INDEX "media_contact_interactions_contact_idx" ON "media_contact_interactions" ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "media_contact_interactions_open_idx" ON "media_contact_interactions" ("due_at") WHERE "due_at" is not null and "completed_at" is null;--> statement-breakpoint
CREATE INDEX "media_contacts_stage_idx" ON "media_contacts" ("stage");--> statement-breakpoint
CREATE INDEX "media_contacts_priority_idx" ON "media_contacts" ("priority");--> statement-breakpoint
CREATE INDEX "media_contacts_manager_idx" ON "media_contacts" ("account_manager_id");--> statement-breakpoint
CREATE INDEX "media_contacts_partner_idx" ON "media_contacts" ("partner_id");--> statement-breakpoint
CREATE INDEX "media_contacts_last_contact_idx" ON "media_contacts" ("last_contact_at");--> statement-breakpoint
CREATE INDEX "media_contacts_name_idx" ON "media_contacts" ("full_name_ar");--> statement-breakpoint
CREATE UNIQUE INDEX "media_contacts_email_unique" ON "media_contacts" ("email") WHERE "email" is not null;--> statement-breakpoint
ALTER TABLE "partner_media_channels" ADD CONSTRAINT "partner_media_channels_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "partner_media_channels" ADD CONSTRAINT "partner_media_channels_channel_id_media_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "media_channels"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_relationship_type_id_relationship_types_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_contact_channels" ADD CONSTRAINT "media_contact_channels_contact_id_media_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "media_contacts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_contact_channels" ADD CONSTRAINT "media_contact_channels_channel_id_media_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "media_channels"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ADD CONSTRAINT "media_contact_interactions_contact_id_media_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "media_contacts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ADD CONSTRAINT "media_contact_interactions_recorded_by_id_users_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_relationship_type_id_relationship_types_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_account_manager_id_users_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL;