ALTER TABLE "ai_inference_logs" ADD COLUMN IF NOT EXISTS "tool_calls" jsonb;
--> statement-breakpoint
ALTER TABLE "ai_inference_logs" ADD COLUMN IF NOT EXISTS "parent_inference_id" integer REFERENCES "ai_inference_logs"("id");
--> statement-breakpoint
ALTER TABLE "ai_inference_logs" ADD COLUMN IF NOT EXISTS "logic_chain_path" text;
--> statement-breakpoint
ALTER TABLE "ai_inference_logs" ADD COLUMN IF NOT EXISTS "confidence_interval" double precision;
--> statement-breakpoint
ALTER TABLE "ledger_lines" ADD COLUMN IF NOT EXISTS "statutory_tag" text;
