CREATE TYPE "form_condition_op" AS ENUM('eq', 'in', 'notEmpty');--> statement-breakpoint
CREATE TYPE "form_field_type" AS ENUM('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'EMAIL', 'PHONE', 'SINGLE_SELECT', 'MULTI_SELECT', 'AREA_REF', 'OFFICE_REF', 'PROGRAM_REF');--> statement-breakpoint
CREATE TYPE "form_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"version_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"label_ar" varchar(300) NOT NULL,
	"hint_ar" varchar(300),
	"type" "form_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"options" jsonb DEFAULT '[]' NOT NULL,
	"condition_field_key" varchar(60),
	"condition_op" "form_condition_op",
	"condition_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_fields_condition_consistency" CHECK (("condition_field_key" is null and "condition_op" is null and "condition_value" is null)
          or ("condition_field_key" is not null and "condition_op" = 'notEmpty' and "condition_value" is null)
          or ("condition_field_key" is not null and "condition_op" in ('eq', 'in') and "condition_value" is not null)),
	CONSTRAINT "form_fields_options_consistency" CHECK (("type" in ('SINGLE_SELECT', 'MULTI_SELECT') and jsonb_array_length("options") > 0)
          or ("type" not in ('SINGLE_SELECT', 'MULTI_SELECT') and jsonb_array_length("options") = 0))
);
--> statement-breakpoint
CREATE TABLE "form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"form_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "form_version_status" DEFAULT 'DRAFT'::"form_version_status" NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_versions_published_consistency" CHECK (("status" = 'PUBLISHED') = ("published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"description_ar" text,
	"office_id" uuid,
	"is_accepting" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "form_fields_key_unique" ON "form_fields" ("version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "form_fields_order_unique" ON "form_fields" ("version_id","display_order");--> statement-breakpoint
CREATE INDEX "form_fields_version_idx" ON "form_fields" ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_number_unique" ON "form_versions" ("form_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_single_draft" ON "form_versions" ("form_id") WHERE "status" = 'DRAFT';--> statement-breakpoint
CREATE INDEX "form_versions_form_idx" ON "form_versions" ("form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forms_slug_unique" ON "forms" ("slug");--> statement-breakpoint
CREATE INDEX "forms_office_idx" ON "forms" ("office_id");--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_version_id_form_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "form_versions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_by_id_users_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_office_id_offices_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;