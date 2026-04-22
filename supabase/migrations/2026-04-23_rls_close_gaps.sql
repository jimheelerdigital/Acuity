-- 2026-04-23 — Close RLS + sensitive-column exposure gaps surfaced by
-- Supabase Security Advisor. Applied to production Supabase the same
-- day via `psql "$DIRECT_URL" -f supabase/migrations/2026-04-23_rls_close_gaps.sql`.
--
-- Context:
--   - The 2026-04-21 RLS pass (commit 1ec8d14, `docs/RLS_STATUS.md`)
--     enabled RLS on 12 user-data tables but left admin/system/content-
--     factory/OAuth-connection tables without RLS. Every table added
--     after that pass (TaskGroup from the AI-grouped-tasks sprint,
--     GoalSuggestion, UserFeatureOverride, AdminAuditLog, etc.) also
--     landed with RLS off.
--   - The advisor flags `rls_disabled_in_public` for every such table
--     and `sensitive_columns_exposed` for OAuth tokens, session
--     tokens, verification tokens, password hashes, reset tokens,
--     push tokens, and Stripe customer/subscription IDs that are
--     readable by the `anon` + `authenticated` Supabase roles.
--
-- Pattern:
--   - `ENABLE ROW LEVEL SECURITY` + an explicit "Deny all for non-
--     service" policy (USING false on cmd=ALL) matching the existing
--     convention on `User`, `Entry`, `Goal`, `Task`, `WeeklyReport`,
--     `LifeAudit`, `LifeMapArea`, `UserMemory`, `UserOnboarding`,
--     `VerificationToken`, `Waitlist`, `Session`.
--   - `REVOKE ALL ON <col>` from `anon` + `authenticated` for
--     secret-bearing columns so even a permissive policy (or a
--     mis-configured direct Supabase.js client) can't see them.
--
-- App impact: zero. Prisma connects as the `postgres` role which
-- bypasses RLS, and never uses `anon` / `authenticated` roles. This
-- is pure defense-in-depth + advisor cleanup.
--
-- Idempotent: safe to re-run. DROP POLICY IF EXISTS precedes each
-- CREATE POLICY. ENABLE RLS is idempotent by default. REVOKE is
-- idempotent (no-op if the grant doesn't exist).

BEGIN;

-- ─── Part 1: Enable RLS on tables that lacked it ────────────────────────────
-- (Every non-system, non-view table in `public` as of 2026-04-23.)

ALTER TABLE public."AdminAuditLog"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CalendarConnection"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClaudeCallLog"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContentBriefing"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContentPiece"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DashboardSnapshot"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DataExport"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeletedUser"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeatureFlag"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GenerationJob"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GoalSuggestion"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MetaSpend"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RedFlag"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReferralConversion"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StripeEvent"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskGroup"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserDemographics"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserFeatureOverride" ENABLE ROW LEVEL SECURITY;

-- ─── Part 2: Explicit deny-all policies ────────────────────────────────────
-- Same cmd=ALL USING(false) pattern as the 2026-04-21 pass. `postgres`
-- (Prisma) bypasses RLS so app paths are unaffected; any anon or
-- authenticated Supabase-JS client gets zero rows, zero writes.

-- 2.a — Tables that just had RLS turned on above.

DROP POLICY IF EXISTS "Deny all for non-service" ON public."AdminAuditLog";
CREATE POLICY "Deny all for non-service" ON public."AdminAuditLog" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."CalendarConnection";
CREATE POLICY "Deny all for non-service" ON public."CalendarConnection" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."ClaudeCallLog";
CREATE POLICY "Deny all for non-service" ON public."ClaudeCallLog" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."ContentBriefing";
CREATE POLICY "Deny all for non-service" ON public."ContentBriefing" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."ContentPiece";
CREATE POLICY "Deny all for non-service" ON public."ContentPiece" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."DashboardSnapshot";
CREATE POLICY "Deny all for non-service" ON public."DashboardSnapshot" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."DataExport";
CREATE POLICY "Deny all for non-service" ON public."DataExport" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."DeletedUser";
CREATE POLICY "Deny all for non-service" ON public."DeletedUser" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."FeatureFlag";
CREATE POLICY "Deny all for non-service" ON public."FeatureFlag" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."GenerationJob";
CREATE POLICY "Deny all for non-service" ON public."GenerationJob" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."GoalSuggestion";
CREATE POLICY "Deny all for non-service" ON public."GoalSuggestion" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."MetaSpend";
CREATE POLICY "Deny all for non-service" ON public."MetaSpend" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."RedFlag";
CREATE POLICY "Deny all for non-service" ON public."RedFlag" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."ReferralConversion";
CREATE POLICY "Deny all for non-service" ON public."ReferralConversion" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."StripeEvent";
CREATE POLICY "Deny all for non-service" ON public."StripeEvent" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."TaskGroup";
CREATE POLICY "Deny all for non-service" ON public."TaskGroup" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."UserDemographics";
CREATE POLICY "Deny all for non-service" ON public."UserDemographics" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."UserFeatureOverride";
CREATE POLICY "Deny all for non-service" ON public."UserFeatureOverride" AS RESTRICTIVE FOR ALL USING (false);

-- 2.b — Tables that had RLS on but no explicit policy. The implicit
-- default ("no policy = deny" once RLS is enabled) is already correct,
-- but the advisor wants an explicit policy documenting intent and the
-- existing 12 tables follow this convention. Add it for consistency.

DROP POLICY IF EXISTS "Deny all for non-service" ON public."Account";
CREATE POLICY "Deny all for non-service" ON public."Account" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."HealthSnapshot";
CREATE POLICY "Deny all for non-service" ON public."HealthSnapshot" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."LifeMapAreaHistory";
CREATE POLICY "Deny all for non-service" ON public."LifeMapAreaHistory" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."StateOfMeReport";
CREATE POLICY "Deny all for non-service" ON public."StateOfMeReport" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."Theme";
CREATE POLICY "Deny all for non-service" ON public."Theme" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."ThemeMention";
CREATE POLICY "Deny all for non-service" ON public."ThemeMention" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."UserInsight";
CREATE POLICY "Deny all for non-service" ON public."UserInsight" AS RESTRICTIVE FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all for non-service" ON public."UserLifeDimension";
CREATE POLICY "Deny all for non-service" ON public."UserLifeDimension" AS RESTRICTIVE FOR ALL USING (false);

-- ─── Part 3: Revoke access to sensitive data ─────────────────────────────
-- `sensitive_columns_exposed` advisor — Supabase default-GRANTs anon +
-- authenticated full privileges on every public table. RLS deny-all
-- policies already block access, but the advisor's heuristic also
-- inspects the GRANT graph, and column-level REVOKE is a no-op when
-- a table-level GRANT exists. For the five tables that ONLY ever
-- hold server-issued secrets (no legitimate anon/authenticated read
-- path) we revoke the whole table from those roles first; for tables
-- where public access might be legitimate in a future feature, we
-- still REVOKE on the sensitive columns individually as documentation
-- even though the policy-level block is what actually enforces.

-- 3.0 — Table-level revoke on secret-bearing tables. These are
-- server-side-only surfaces (NextAuth, Prisma, webhooks) and the
-- advisor will re-flag the column exposures unless the table-level
-- grants are gone.
REVOKE ALL ON TABLE public."Account"            FROM anon, authenticated;
REVOKE ALL ON TABLE public."Session"            FROM anon, authenticated;
REVOKE ALL ON TABLE public."VerificationToken"  FROM anon, authenticated;
REVOKE ALL ON TABLE public."User"               FROM anon, authenticated;
REVOKE ALL ON TABLE public."CalendarConnection" FROM anon, authenticated;

-- 3.a — NextAuth OAuth account tokens
REVOKE ALL (refresh_token)  ON public."Account" FROM anon, authenticated;
REVOKE ALL (access_token)   ON public."Account" FROM anon, authenticated;
REVOKE ALL (id_token)       ON public."Account" FROM anon, authenticated;
REVOKE ALL (token_type)     ON public."Account" FROM anon, authenticated;
REVOKE ALL (session_state)  ON public."Account" FROM anon, authenticated;
REVOKE ALL (expires_at)     ON public."Account" FROM anon, authenticated;

-- 3.b — NextAuth session + verification tokens
-- camelCase column identifiers require double-quoting so Postgres
-- doesn't lowercase them during resolution.
REVOKE ALL ("sessionToken") ON public."Session"           FROM anon, authenticated;
REVOKE ALL (token)          ON public."VerificationToken" FROM anon, authenticated;

-- 3.c — User auth secrets + Stripe IDs + push token
-- passwordHash is bcrypted but we don't want the hash leaked either.
-- resetToken grants password-reset powers until it expires.
-- pushToken is the Expo/APNs push credential for this device.
-- stripeCustomerId / stripeSubscriptionId are stable external identifiers
-- that shouldn't reach the client — Stripe portal links use short-lived
-- session URLs, not the raw customer id.
REVOKE ALL ("passwordHash")         ON public."User" FROM anon, authenticated;
REVOKE ALL ("resetToken")           ON public."User" FROM anon, authenticated;
REVOKE ALL ("resetTokenExpires")    ON public."User" FROM anon, authenticated;
REVOKE ALL ("pushToken")            ON public."User" FROM anon, authenticated;
REVOKE ALL ("stripeCustomerId")     ON public."User" FROM anon, authenticated;
REVOKE ALL ("stripeSubscriptionId") ON public."User" FROM anon, authenticated;

-- 3.d — Calendar integration OAuth tokens
REVOKE ALL ("accessToken")    ON public."CalendarConnection" FROM anon, authenticated;
REVOKE ALL ("refreshToken")   ON public."CalendarConnection" FROM anon, authenticated;
REVOKE ALL ("tokenExpiresAt") ON public."CalendarConnection" FROM anon, authenticated;

COMMIT;

-- ─── Post-flight check ────────────────────────────────────────────────────
-- Expected: every public table has rowsecurity=t + exactly one
-- "Deny all for non-service" policy. Every sensitive column above has
-- zero privileges for anon + authenticated.
--
--   SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables WHERE schemaname='public'
--   ORDER BY rowsecurity, tablename;
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' ORDER BY tablename;
--
--   SELECT grantee, table_name, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema='public'
--     AND grantee IN ('anon','authenticated')
--     AND column_name IN
--       ('refresh_token','access_token','id_token','sessionToken',
--        'token','passwordHash','resetToken','pushToken',
--        'stripeCustomerId','stripeSubscriptionId','accessToken',
--        'refreshToken');
-- (The third query should return zero rows.)
