-- Calendar, "option a" (phone calendar), 2026-10-23. Additive + nullable/defaulted.
-- APPLY BEFORE MERGING feat/apple-calendar: lib/calendar/context.ts selects
-- CalendarEvent."allDay" and the stuck-task cron reads Task."calendarPendingSince".
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "calendarPendingSince" TIMESTAMP(3);
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "allDay" BOOLEAN NOT NULL DEFAULT false;
-- At release (Jimmy's go): turn the feature on for Pro.
-- UPDATE "FeatureFlag" SET enabled = true, "requiredTier" = 'PRO' WHERE key = 'calendar_integrations';
