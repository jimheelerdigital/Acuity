-- Processing phase marks for the "speed up processing" measurement
-- (2026-10-17). Additive, nullable. Applied to production 10/17 as
-- Supabase migration `entry_processing_timeline`.
ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "processingTimeline" JSONB;
