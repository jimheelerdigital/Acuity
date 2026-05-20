-- 2026-05-19 — Add User.themePalette (Slice Q2, visual refresh v2)
--
-- Holds the user's accent palette pick from the new Profile →
-- Appearance card (coral | sunset | citrus | cobalt). Defaults to
-- "coral" so existing rows match the build-42 default the app
-- already renders for unauthenticated boots.
--
-- Additive-safe: nullable in spirit (default applies to existing
-- rows), no read-paths in the live build 42 binary that would
-- choke on the new column. Build 45+ mobile reads + writes via
-- /api/user/theme (extended in the same slice).
--
-- Cross-device sync: mode + palette both stored on User; haptics
-- stays device-local (per Jim's directive — haptics is contextual,
-- different choice per device makes sense).
--
-- Idempotent. Safe to re-run.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "themePalette" TEXT NOT NULL DEFAULT 'coral';
