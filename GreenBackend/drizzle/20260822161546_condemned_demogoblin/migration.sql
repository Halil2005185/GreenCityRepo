ALTER TYPE "form_field_type" ADD VALUE 'URL' BEFORE 'SINGLE_SELECT';--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "min_selections" integer;--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "max_selections" integer;--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "max_length" integer;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_selection_limits" CHECK (("type" = 'MULTI_SELECT'
             and coalesce("min_selections", 1) >= 1
             and coalesce("max_selections", 1) >= coalesce("min_selections", 1))
          or ("type" <> 'MULTI_SELECT'
             and "min_selections" is null
             and "max_selections" is null));--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_max_length_scope" CHECK (("type" in ('TEXT', 'LONG_TEXT') and coalesce("max_length", 1) >= 1)
          or ("type" not in ('TEXT', 'LONG_TEXT') and "max_length" is null));