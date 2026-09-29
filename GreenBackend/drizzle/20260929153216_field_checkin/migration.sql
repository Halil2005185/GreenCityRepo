ALTER TABLE "attendance" ADD COLUMN "checked_in_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "undone_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "field_groups" ADD COLUMN "checkin_secret" varchar(64);--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_checked_in_by_participant_id_participants_id_fkey" FOREIGN KEY ("checked_in_by_participant_id") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_undone_by_participant_id_participants_id_fkey" FOREIGN KEY ("undone_by_participant_id") REFERENCES "participants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_single_recorder" CHECK (num_nonnulls("checked_in_by_id",
                       "checked_in_by_participant_id") <= 1);