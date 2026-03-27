ALTER TABLE "pre_shift_notes" ADD COLUMN IF NOT EXISTS "raw_content" text;
--> statement-breakpoint
ALTER TABLE "pre_shift_notes" ADD COLUMN IF NOT EXISTS "focus" text DEFAULT 'all';
