CREATE TYPE "contributor_kind" AS ENUM('INDIVIDUAL', 'COMPANY', 'INSTITUTION', 'SCHOOL', 'VOLUNTEER_TEAM', 'OTHER');--> statement-breakpoint
CREATE TYPE "initiative_kind" AS ENUM('CAMPAIGN', 'GREEN_POINT');--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "boundary" jsonb;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "kind" "initiative_kind" DEFAULT 'CAMPAIGN'::"initiative_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "contributor_name_ar" varchar(200);--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "contributor_kind" "contributor_kind";--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_green_point_has_contributor" CHECK ("kind" <> 'GREEN_POINT' or "contributor_name_ar" is not null);