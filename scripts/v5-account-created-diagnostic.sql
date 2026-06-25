-- ============================================================================
-- v5 funnel diagnostic — "Account Created" 8 → 2 drop
-- ============================================================================
--
-- WHY THIS EXISTS
-- The v5 (paywall-first) funnel dashboard shows a steep drop on the
-- "Account Created" step: Paywall 10 → Create Account 8 → Account Created 2.
-- This file decides whether that 8 → 2 is a REAL signup-form drop-off or a
-- METRICS ARTIFACT (the funnel_account_created event under- or over-firing).
--
-- The code review found two specific candidate bugs (see ROOT-CAUSE NOTES at
-- the bottom). This SQL is the decisive test — it compares real User rows in
-- the database against the funnel_account_created events the dashboard counts.
--
-- HOW TO RUN
-- Supabase is blocked on the work network — run this from the home network
-- (psql, the Supabase SQL editor, or any Postgres client). Read query D's
-- output against the DECISION TABLE below.
--
-- DATE WINDOW
-- Defaults to the last 3 days (now() - interval '3 days' .. now()). To pin a
-- specific window, edit the two values in the `win` CTE at the top of each
-- query. Keep both queries on the SAME window so the counts are comparable.
--   <<< EDIT HERE >>>  — replace the interval / timestamps as needed.
--
-- ----------------------------------------------------------------------------
-- DECISION TABLE  (read query D's three numbers, pick the matching row)
-- ----------------------------------------------------------------------------
--
--   db_users_created ≈ evt_account_created   (both ~2)
--       → 8 → 2 is REAL signup-form friction.
--       → FIX: reduce create-account form friction (the funnel is accurate;
--               people are seeing the form and not finishing it).
--
--   db_users_created > evt_account_created, gap concentrated in db_oauth_created
--       → OAuth funnel_account_created is UNDER-firing.
--       → FIX: make the OAuth path fire funnel_account_created reliably. The
--               event only fires when the browser returns to
--               /start?step=post-signup; it is lost on origin mismatch
--               (getacuity.io vs www.getacuity.io), in-app/webview storage
--               partitioning, or any redirect that doesn't land on that step.
--               Real conversion is HIGHER than the dashboard shows.
--
--   evt_account_created > db_users_created
--       → Existing-user sign-ins are OVER-firing the event (see :327 note).
--       → FIX: stop firing funnel_account_created for returning sign-ins;
--               gate it to genuinely new accounts only.
--
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. Real accounts created in the window, split by signup method
--    Returns one row per signupMethod with the count of User rows created.
--    Use to see how much of the cohort is OAuth (google/apple) vs email.
-- ----------------------------------------------------------------------------
WITH win AS (
  SELECT (now() - interval '3 days') AS start_ts,   -- <<< EDIT HERE >>>
         now()                       AS end_ts       -- <<< EDIT HERE >>>
)
SELECT COALESCE("signupMethod", '(null)') AS method,
       COUNT(*)                           AS users_created
FROM "User", win
WHERE "createdAt" >= win.start_ts
  AND "createdAt" <  win.end_ts
GROUP BY 1
ORDER BY 2 DESC;


-- ----------------------------------------------------------------------------
-- B. Real trials + paid subscriptions among that cohort
--    on_trial      = User rows still in TRIAL
--    has_stripe_sub = User rows with a Stripe subscription attached (paid)
-- ----------------------------------------------------------------------------
WITH win AS (
  SELECT (now() - interval '3 days') AS start_ts,   -- <<< EDIT HERE >>>
         now()                       AS end_ts       -- <<< EDIT HERE >>>
)
SELECT
  COUNT(*) FILTER (WHERE "subscriptionStatus" = 'TRIAL')      AS on_trial,
  COUNT(*) FILTER (WHERE "stripeSubscriptionId" IS NOT NULL)  AS has_stripe_sub
FROM "User", win
WHERE "createdAt" >= win.start_ts
  AND "createdAt" <  win.end_ts;


-- ----------------------------------------------------------------------------
-- C. v5 funnel event counts (distinct sessions) — the dashboard's own view
--    Should reproduce the dashboard's tail: Paywall → Create Account →
--    Account Created → Trial Continued → Download (+ payment_completed).
--    Confirms we're reading the same numbers the dashboard shows.
-- ----------------------------------------------------------------------------
WITH win AS (
  SELECT (now() - interval '3 days') AS start_ts,   -- <<< EDIT HERE >>>
         now()                       AS end_ts       -- <<< EDIT HERE >>>
)
SELECT event,
       COUNT(DISTINCT "sessionToken") AS sessions
FROM "OnboardingEvent", win
WHERE "flowVersion" = 'v5'
  AND "isBot" = false
  AND "sessionToken" IS NOT NULL
  AND "createdAt" >= win.start_ts
  AND "createdAt" <  win.end_ts
  AND event IN ('funnel_savings_viewed',
                'funnel_create_account_viewed',
                'funnel_account_created',
                'funnel_trial_continued',
                'funnel_download_viewed',
                'funnel_payment_completed')
GROUP BY event
ORDER BY sessions DESC;


-- ----------------------------------------------------------------------------
-- D. THE DECISIVE QUERY — real account-creates vs account_created events
--    Compare these four numbers against the DECISION TABLE at the top.
--      db_users_created   = all User rows created in window
--      db_email_created   = of those, signupMethod = 'email'
--      db_oauth_created   = of those, signupMethod in ('google','apple')
--      evt_account_created = distinct sessions that fired funnel_account_created
-- ----------------------------------------------------------------------------
WITH win AS (
  SELECT (now() - interval '3 days') AS start_ts,   -- <<< EDIT HERE >>>
         now()                       AS end_ts       -- <<< EDIT HERE >>>
)
SELECT
  (SELECT COUNT(*) FROM "User", win
     WHERE "createdAt" >= win.start_ts AND "createdAt" < win.end_ts)
       AS db_users_created,
  (SELECT COUNT(*) FROM "User", win
     WHERE "signupMethod" = 'email'
       AND "createdAt" >= win.start_ts AND "createdAt" < win.end_ts)
       AS db_email_created,
  (SELECT COUNT(*) FROM "User", win
     WHERE "signupMethod" IN ('google', 'apple')
       AND "createdAt" >= win.start_ts AND "createdAt" < win.end_ts)
       AS db_oauth_created,
  (SELECT COUNT(DISTINCT "sessionToken") FROM "OnboardingEvent", win
     WHERE event = 'funnel_account_created'
       AND "flowVersion" = 'v5'
       AND "isBot" = false
       AND "createdAt" >= win.start_ts AND "createdAt" < win.end_ts)
       AS evt_account_created;


-- ============================================================================
-- ROOT-CAUSE NOTES (from the read-only code review — fixes NOT yet applied)
-- ============================================================================
--
-- Two firing sites for funnel_account_created in
-- apps/web/src/components/onboarding-funnel.tsx:
--
--   1. Email/password — RELIABLE.
--      CreateAccountScreen POSTs /api/auth/signup (creates the User row
--      server-side), then calls onAccountCreated() in the same mounted
--      component, which fires funnel_account_created. DB write and event fire
--      happen in one continuous client session, so they match.
--
--   2. OAuth (Google/Apple) — FRAGILE.
--      signIn(provider, { callbackUrl: "/start?step=post-signup" }). The User
--      row is created server-side by the NextAuth adapter regardless of the
--      browser. funnel_account_created only fires when the browser returns to
--      /start?step=post-signup and runs line ~327. It is LOST on:
--        - origin mismatch (getacuity.io vs www.getacuity.io) — localStorage
--          session token is origin-scoped,
--        - in-app/webview storage partitioning (Facebook/Instagram),
--        - any redirect that doesn't land on that step.
--      → UNDER-fire candidate.
--
-- KNOWN CORRECTNESS BUG — OVER-FIRE at onboarding-funnel.tsx ~line 327
--   (independent of query D's outcome; fix regardless):
--      The existing-user "Sign in" buttons ALSO use
--      callbackUrl=/start?step=post-signup. Line ~327 fires
--      funnel_account_created UNCONDITIONALLY for anyone hitting
--      stepParam === "post-signup" — so a RETURNING user signing in is counted
--      as a new account creation, inflating Account Created.
--      FIX (ready to implement after query D): gate the line-327 fire so it
--      only counts genuinely NEW accounts, not returning sign-ins — e.g. pass
--      a "new account" signal through the OAuth round-trip (distinct
--      callbackUrl/step or a one-shot flag set only on the create-account
--      action) and fire funnel_account_created only when that signal is
--      present. Returning sign-ins must NOT fire it.
--
-- DO NOT implement any fix until query D has been run and the DECISION TABLE
-- row is chosen.
-- ============================================================================
