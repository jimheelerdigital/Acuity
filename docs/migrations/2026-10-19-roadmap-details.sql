-- Roadmap detail pages (2026-10-19). Additive, all nullable / defaulted;
-- no existing column changes. To be applied to production as Supabase
-- migration `roadmap_details` BEFORE the web deploy that selects them.
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "category"   TEXT;
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "timeframe"  TEXT;
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "problem"    TEXT;
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "solution"   TEXT;
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RoadmapItem" ADD COLUMN IF NOT EXISTS "howTo"      TEXT;
