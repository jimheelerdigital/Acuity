# Acuity — Progress Log

**Product:** Acuity — Nightly Voice Journaling
**Stack:** Next.js 14 (web) + Expo SDK 54 (mobile) + Supabase/Prisma + Stripe
**Production:** https://getacuity.io
**Goal:** App Store deployment

---

## Current Focus
- Inngest migration (`INNGEST_MIGRATION_PLAN.md`) — the gate to the Day 14 audit cron and the move to Heeler Digital Hobby. Resolve §14 open questions, then ship PR 1 (bootstrap, no behavior change).
- Jim flips his own `isAdmin` row in Supabase SQL editor to unlock `/admin/dashboard` post-deploy.

## Blockers / Waiting On
- Keenan to add Jimmy as a proper collaborator on Vercel (currently using Keenan's login as a workaround), Supabase, Stripe, Anthropic, OpenAI, Resend, Expo/EAS, Cloudflare, Meta Business Suite.

## Open Decisions
- **Apple IAP strategy** — RevenueCat + Apple IAP, or iOS as log-in-only companion. Blocks any iOS App Store submission.
- **Push notifications in v1 or v2** — Product Brief says v2; habit-loop nature of the app suggests v1.
- **Price: $12.99 or $19/mo** — Product Brief + Personas say $12.99; Product Spec + Onboarding Spec say $19. Not resolving now per Jimmy (focus is build/deploy), but must be locked before paywall/App Store listing.

---

## Decisions Made
- **2026-04-17** — Repo transferred from `keypicksem/Acuity` → `jimheelerdigital/Acuity`. Vercel connection survives transfer.
- **2026-04-17** — Repo to stay under `jimheelerdigital` personal account for now. Heeler Digital GitHub org to be created and repo re-transferred later once TestFlight is submitted.
- **2026-04-17** — Repo remains public for now; revisit visibility later.
- **2026-04-17** — **Paywall approach: soft transition, not cliff.** The Day 14 Life Audit's closing paragraph transitions directly into a preview of Month 2 (Monthly Memoir, week-over-week deepening, 60-day retrospective). Upgrade screen sells "next chapter of the journey," not "unlock features." Users who don't subscribe retain permanent access to their 14-day trial history; new forward-looking outputs (weekly reports going forward, monthly memoir, new patterns, life audits beyond Day 14) are paywalled. Rationale: product is an ongoing journey, not a feature set; Peak-End Rule and retention math both favor soft transition over a feature cliff. The product brief's 14-day free trial model is unchanged — this decision is about the emotional and structural experience of the trial-to-paid transition.
- **2026-04-17** — **Proposed post-trial journey roadmap** (not yet committed spec — subject to refinement):
  - Day 14 (trial end): Life Audit #1 — the emotional anchor
  - Day 30: Monthly Memoir (already in spec §1.9)
  - Day 60: "Your First Two Months" — side-by-side comparison of Day 1 vs Day 60 themes, goals, language patterns. The "look how far you've come" moment.
  - Day 90: Quarterly Life Audit — 90-day version of the Day 14 audit, deeper with more data
  - Day 180: Half-year memoir — longer-form artifact covering 6 months
  - Day 365: Annual memoir — the flagship retrospective
- **2026-04-17** — Paywall plan rev 2 APPROVED by Jim. Ready for implementation after Inngest migration lands as hard prerequisite. Per-resolution entries follow:
- **2026-04-17** — Day 14 Life Audit generation: daily Inngest cron at ~22:00 user-local, one day before `trialEndsAt`. Rationale: users must arrive at Day 14 already holding the audit; lazy-generate on load risks empty-state cliff.
- **2026-04-17** — Weekly reports for post-trial free users: STRICT rule (Option A). No new weekly reports after trial expiry. Rationale: Life Audit is the final free forward-looking artifact; any grace window muddies the value proposition.
- **2026-04-17** — Stripe checkout: REMOVE `trial_period_days` entirely. Acuity's `trialEndsAt` is the canonical trial clock; Stripe subscription starts paid immediately on subscribe. Rationale: single source of truth; avoids the 14+7 = 21-day compounding trial; matches "14-day free trial model is unchanged."
- **2026-04-17** — Tasks and goals post-trial: remain PATCH-able; no new ones born without recording. Named explicitly in the post-trial email copy so it isn't a surprise in either direction.
- **2026-04-17** — Post-trial chart ghost states: render annotations on mood/life-map/theme charts at the `trialEndsAt` boundary ("Trial ended — new entries resume with subscription"), muted tail continuing. No silent gaps. Rationale: silence feels broken; annotation is the soft-transition move.
- **2026-04-17** — Life Map refresh for post-trial users: OVERRIDE of Claude Code's "disabled button" recommendation. Instead: button stays visually enabled; on tap, full-screen "Month 2 lives here" interstitial links to `/upgrade?src=lifemap_interstitial`. Rationale (Jim): a greyed-out button is passive guilt that sits forever; tap-to-interstitial converts on intent, which is the soft-transition pattern at the interaction level.
- **2026-04-17** — Life Audit closing paragraph prompt: written as a few-shot (hand-crafted example embedded inside the system prompt), NOT just instructed. Rationale: instructions alone drift into coach voice (imperatives, exclamations); example anchors voice in ~350 tokens for near-zero inference cost.
- **2026-04-17** — "Continue it →" Life Audit CTA: ships as body copy for MVP; instrumented as `upgrade_page_cta_clicked { ctaVariant: 'continue_it_body' }`. Threshold for A/B testing a button variant: click-through <15% over ≥50 post-trial users with a viewed audit. Both click-through and post-click conversion inform the decision.
- **2026-04-17** — Day 14 Life Audit rollback plan (new §7): if audit is not COMPLETE when paywall would enforce, extend `trialEndsAt` by 48h, re-attempt every 6h, generate template-based degraded fallback after 48h, enforce only then. Invariant: a user never hits the paywall without having read their Life Audit.
- **2026-04-17** — Analytics events (new §8): 6 required events (`trial_started`, `life_audit_generated`, `life_audit_viewed`, `upgrade_page_viewed`, `upgrade_page_cta_clicked`, `subscription_started`) must ship with the feature. Recommended platform: PostHog (single SDK web+mobile+server; cohort analysis first-class). Alternative: minimal in-house `AnalyticsEvent` Prisma table. Jim to pick before shipping.
- **2026-04-17** — `entitlements.ts` test coverage (new §9): full-matrix Vitest unit tests required BEFORE enforcement lands. Every `subscriptionStatus` × `trialEndsAt` × `now()` combination + rollback-mode cases + property-based partition check. No test suite exists in the repo yet — Vitest setup is part of this PR.
- **2026-04-17** — Price deferred via `{{PRICE_PER_MONTH}}` template variable throughout copy drafts. Push notifications remain v2 per Open Decisions; post-trial email carries Day 14 touchpoint for v1.
- **2026-04-17** — Inngest migration is a HARD PREREQUISITE for the paywall implementation. Day 14 cron cannot ship reliably on the current sync pipeline (120s Vercel cap, no retries). Sequencing updated in plan §5.8.
- **2026-04-18** — Analytics platform: PostHog. Rationale: single SDK spans web + mobile + server; cohort/funnel/retention analysis first-class; free tier covers first several months. Flagged for iOS App Store privacy questionnaire at submission time (declare Identifiers + Usage Data + Diagnostics under App Privacy; name PostHog in the privacy policy).
- **2026-04-18** — Test framework: Vitest confirmed. Rationale: native ESM, faster than Jest, trivial to configure for Next.js 14 + TypeScript.
- **2026-04-18** — No user backfill because there are no existing real users — only test accounts. Backfill step dropped from plan §5.8 and Next Up. Post-deploy, test accounts are either manually updated (`UPDATE "User" SET "trialEndsAt" = now() + interval '14 days' WHERE "trialEndsAt" IS NULL;`) or deleted and recreated.
- **2026-04-18** — Mobile `/upgrade` link: keep the web redirect for the paywall PR; IAP remains a separate unresolved decision. Instrument `?src=mobile_profile` on the mobile upgrade button regardless so cross-surface conversion is measurable today (mobile → web checkout) and carries over once IAP lands (mobile → native sheet).
- **2026-04-18** — Degraded Day 14 Life Audit fallback shape: full template, NO Claude call. Template-filled narrative (entry count, top themes from `Entry.themes`, mood average, Life Map deltas, goal-mention counts) + hard-coded closing paragraph drafted inline in plan §7.3. Tag record `degraded: true`. Rationale: if Claude is the failure mode, the fallback can't depend on Claude; a hard-coded closing is resilient above the DB layer. Voice matched to the §4.1 few-shot so users never know they got the fallback.
- **2026-04-18** — Accept Supabase project ref exposure rather than migrate. Rationale: no paying users, password rotated, project ref alone doesn't grant access. Migration will happen naturally when consolidating Supabase under Heeler Digital org.
- **2026-04-19** — **Inngest migration: polling confirmed as v1 client completion mechanism.** Supabase Realtime deferred until post-launch; revisit only if polling cost scales poorly (e.g., 500+ users where poll volume warrants Realtime for bandwidth). Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 1 / §6.2. Rationale: polling works on Hobby without depending on RLS (blocked on Supabase access), same code for web + mobile, perceived latency at 2s intervals is tolerable for 10–30s typical processing.
- **2026-04-19** — **Inngest migration: recording duration hard cap set at 120s server-side, not 180s.** Enforced as a `413 Payload Too Large` in `/api/record` whenever `durationSeconds > 120`. Web client cap also moves from 60s → 120s to match mobile. Rationale: product spec is explicit about the 30–120s range; Acuity's positioning ("60 seconds in") is contradicted by a 180s ceiling. The cap is primarily for UX/product fit + cost control, NOT for Hobby viability (at 120s audio, Whisper typically completes in 3–7s, well inside Hobby's 10s per-step ceiling). Corrected `INNGEST_MIGRATION_PLAN.md` §12 framing accordingly — the genuine Hobby argument is that every *outer* API route (the handlers the client calls) becomes <2s by offloading work to Inngest steps.
- **2026-04-19** — **Inngest migration: retry budgets split by function type.** User-interactive functions (`processEntryFn`, `refreshLifeMapFn`) use `retries: 2` → worst-case user-visible latency ~3 min. Background/scheduled functions (`generateWeeklyReportFn`, `day14AuditCronFn`) use `retries: 3` → worst-case ~14 min but no user is watching, so patience for vendor outages wins. Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 3 / §3.1–§3.4. Note: Inngest SDK controls backoff timing internally (exponential with jitter); `retries` count is the only user-facing knob.
- **2026-04-19** — **Inngest migration: paywall PR interleaving approved.** Paywall PRs 1–7 (from `IMPLEMENTATION_PLAN_PAYWALL.md` §5.8) can run in parallel with Inngest PRs 1–6. Paywall PR 8 (Day 14 cron) is the hard join point — it depends on Inngest being complete in production. Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 4.
- **2026-04-19** — **Inngest migration: env var names standardized.** `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (the SDK's conventional names — no prefix, no custom casing). Plus the feature-flag env var `ENABLE_INNGEST_PIPELINE` (string `"1"` = on, anything else = off). All three added to `.env.example` + `turbo.json` `globalEnv` array in PR 1.
- **2026-04-19** — **Inngest migration: account owner is `jim@heelerdigital.com`.** Inngest Cloud account created under the Heeler Digital email so the account has the right home long-term. Not tied to a personal email.
- **2026-04-19** — **Inngest migration: PARTIAL entry UX is toast-only for v1** (Claude Code recommended default). An entry that succeeded on the happy path but whose memory or lifemap update failed gets `Entry.status = PARTIAL` + a client-side toast: *"Your entry is saved, but Life Matrix updates will catch up shortly."* No manual retry action. Rationale: the next successful entry re-triggers the memory/lifemap update path; a manual "refresh failed updates" button adds UI noise for a 1%-or-less case that self-heals. Revisit once we see it in production.
- **2026-04-19** — **Inngest migration: observability tooling deferred.** Inngest's own dashboard is sufficient for run-level visibility in v1. Add Sentry / Datadog post-launch if our-code-path errors aren't traceable enough from Vercel logs + Inngest dashboard alone.

---

## Known Issues / Tech Debt
- `CLAUDE.md` is a generic WAT-framework template, not project-specific. Replace or remove when we have real context to put there.
- AI pipeline runs inside Vercel serverless request (10s timeout). Whisper + Claude extraction can exceed this. Needs Inngest migration.
- ~~Prisma schema changes pending `npx prisma db push`~~ — done 2026-04-19; `UserMemory`, `Waitlist`, and the new `User.isAdmin` column are live in prod.
- Stripe webhook endpoint needs to point to `https://getacuity.io/api/stripe/webhook`.
- Model references in specs are stale (`claude-sonnet-4-5`, `claude-opus-4-6`). Current is `claude-sonnet-4-6` / `claude-opus-4-7`. Needs global update in prompts/calls.
- Mobile app built with Expo SDK 54, EAS configured, not yet on TestFlight.
- **2026-04-17** — Supabase DB password leak at commit `799a635` (`apps/web/.env.local.save`, public repo): password rotated 2026-04-18; `.gitignore` + gitleaks hook shipped 2026-04-18. Residual: the `.env.local.save` blob still exists in git history — purge with `git filter-repo` is tracked in Next Up (hygiene only; rotation is the actual fix since the repo was public). Supabase connection logs should still be audited since 2026-04-13 10:37 CST.
- **2026-04-17** — Stale Claude model in prod: `packages/shared/src/constants.ts:79` uses `claude-sonnet-4-5`. Update to `claude-sonnet-4-6` (or `claude-opus-4-7`).
- **2026-04-17** — `/api/record` has `export const maxDuration = 120` (Vercel Pro-only). Blocks Hobby + caps long entries. Fix with Inngest.
- **2026-04-17** — `eas.json` `production` profile is `{}`. No distribution, no iOS signing, no `ascAppId`/`appleTeamId`. `eas submit` cannot succeed.
- **2026-04-17** — `app.json` missing `ios.buildNumber`. App Store will reject.
- **2026-04-17** — Mobile `app.json` `owner: "keypicksem"` (Keenan's Expo account). Needs transfer or recreate under Jimmy's account before submission.
- **2026-04-17** — Prisma schema missing `onDelete: Cascade` on `Entry/Task/Goal/WeeklyReport/LifeMapArea/UserMemory.user` relations and on `Task.entry`. Orphan rows on user or entry delete.
- **2026-04-17** — Prisma schema missing indexes on every `userId` FK and on commonly-filtered fields (`Entry.status`, `Entry.entryDate`, `Task.status`, `Goal.status`).
- **2026-04-17** — No migrations directory; repo uses `prisma db push`. No schema-change audit trail.
- **2026-04-17** — Naming inconsistencies: `UserMemory.relationshipSummary` (singular) vs `DEFAULT_LIFE_AREAS` key `"relationships"` (plural). Separately, `/api/goals` defaults `lifeArea` to `"PERSONAL"`, which isn't in the six-area vocabulary.
- **2026-04-17** — Legacy duplicate recording screen `apps/mobile/app/record.tsx` (600s max, raw fetch, no result UI) conflicts with `app/(tabs)/index.tsx`. Delete.
- **2026-04-17** — `apps/mobile/lib/supabase.ts` creates a Supabase client that is never imported. Dead code.
- **2026-04-17** — No push notifications on mobile (`expo-notifications` not installed). Habit-loop product likely wants this at v1.
- **2026-04-17** — No IAP / RevenueCat on mobile; `/upgrade` opens web URL. Won't pass Apple 3.1.1.
- **2026-04-17** — Hardcoded admin email `keenan@heelerdigital.com` in `/api/waitlist/route.ts:65`.
- **2026-04-17** — Hardcoded Meta Pixel (`5752790988087389`) and Contentsquare script in `apps/web/src/app/layout.tsx`. Move to env.
- **2026-04-17** — Landing page (`apps/web/src/components/landing.tsx` lines 1291/1603/1949) ships fake testimonials + placeholder avatars with TODOs. FTC/Meta ad risk.
- **2026-04-17** — Stripe webhook has no idempotency (`event.id` not persisted); no `customer.subscription.updated` handler; unchecked `session.customer` / `invoice.customer` casts.
- **2026-04-17** — No rate limiting on `/api/auth/*`, `/api/waitlist`, or `/api/record` (the expensive one).
- **2026-04-17** — `/api/record` silently swallows memory + life-map update failures; entry marked complete while Life Matrix drifts.
- **2026-04-17** — `/api/weekly` POST has no `maxDuration` and no transaction around "create GENERATING → Claude → update"; mid-call crash leaves stuck reports.
- **2026-04-17** — `/api/lifemap` N+1: creates default areas in a loop. Use `createMany({ skipDuplicates: true })`.
- **2026-04-17** — `Task.SNOOZED` path writes `snoozedUntil` but nothing ever un-snoozes. Also verify `TaskStatus` enum actually has `SNOOZED`.
- **2026-04-17** — Prisma version skew: root `^5.22.0` vs `apps/web` `^5.16.0`. Unify.
- **2026-04-17** — Unused deps: `nodemailer` (web, replaced by Resend), `expo-audio` / `expo-auth-session` / `@supabase/supabase-js` (mobile, unused).
- **2026-04-17** — `scripts/test-drip-emails.ts` hardcodes recipient + sender, no dry-run; will blast real emails if `RESEND_API_KEY` is set.
- **2026-04-17** — `turbo.json` missing `lint` / `typecheck` tasks — root scripts exist but Turbo doesn't orchestrate them.
- **2026-04-17** — No test suite anywhere in the repo.
- **2026-04-17** — No onboarding flow implemented (mobile or web) despite onboarding spec.

---

## Parked / Deferred

- **Waitlist drip email sequence (2026-04-19 — parked).** The four follow-up emails in `apps/web/src/lib/drip-emails.ts` (steps 2–5: days 2, 5, 10, 14) are built and `emailSequenceStep` tracking is wired, but nothing invokes `/api/cron/waitlist-drip`: no `vercel.json`, no GitHub Action, no external scheduler. Verified by grep — the only references to the route in source are the handler itself and its console.error log. The security fix (fail-closed auth on the route) stays shipped; what's parked is wiring a scheduler. Rationale: email copy references *"doors opening soon"* / *"We're putting the final touches"* / Day-14 launch framing that presumes a launch date which does not exist today. Reactivating the drip before a real launch date sends promises we can't keep and trains Resend's deliverability model that we send unsubstantiated urgency. Wire this up when the launch date is real — at that point also migrate the scheduler to an Inngest cron (see `INNGEST_MIGRATION_PLAN.md` §12) rather than a fresh `vercel.json` cron.

---

## Done

### 2026-04-19
- **Privacy Policy + Terms of Service stubs shipped** at `/privacy` and `/terms` (commit `ac52682`). Pre-legal-review baseline. Privacy covers data we collect (audio, transcripts, AI extractions, account, subscription, analytics, ops logs), why we collect each, the seven named subprocessors with privacy-policy links (Anthropic, OpenAI, Supabase, Stripe, Resend, Vercel, Inngest), retention (indefinite while active, deletion-on-request with 30-day backup purge, ~7 yr Stripe records with redaction), GDPR Art. 15/17/20 + CCPA-mapped rights with `privacy@getacuity.io` channel + 30-day SLA, 13+ children's policy, security posture, change-notification commitment. Terms covers eligibility (18+), account responsibility (including consent for recording other people), acceptable use (no illegal/harassment/reverse-engineering/scraping/resale), subscription terms (14-day free trial, `{{PRICE_PER_MONTH}}`/mo, auto-renew, cancel anytime, no partial refunds, 30-day price-change notice, Stripe's 3-week retry window), content ownership (user owns; we license for service delivery only), the **callout-styled "Acuity is not therapy" disclosure** with 988 / 116 123 / findahelpline references, warranty disclaimer, liability cap (greater of 12 months fees or $100), termination, governing law via `{{JURISDICTION}}` template variable. Footer links in `landing-shared.tsx` + `landing.tsx` rewired from `#` to `/terms` + `/privacy`; Contact `#` → `mailto:hello@getacuity.io`. The auth/signin page already had `<a href="/terms">` + `<a href="/privacy">` in its "By continuing you agree…" copy — those links resolved 404 until this PR. Two template variables left for Jim: `{{PRICE_PER_MONTH}}` (Open Decisions: $12.99 vs $19) and `{{JURISDICTION}}` (governing law). Stubs are not legal-review-grade; Jim takes them through real legal review before public beta.
- **Life-area vocabulary reconciled** (commit `d9e4994`). Resolves a long-running inconsistency that's been flagged in `AUDIT.md` and `PROGRESS.md` since the audit landed: three vocabularies were live (constants.ts had Health/Wealth/Relationships/Spirituality/Career/Growth, web+mobile goal-list had Personal/Work/Health/Relationships/Finance/Learning, product spec specified CAREER/HEALTH/RELATIONSHIPS/FINANCES/PERSONAL/OTHER). Adopted the product spec as canonical. Three forms in code: `LIFE_AREAS` UPPER_CASE enum stored on `LifeMapArea.area` and `Goal.lifeArea`, `LIFE_AREA_PROMPT_KEYS` lowercase form for Claude prompts + UserMemory column suffixes, `LIFE_AREA_DISPLAY` for user-facing strings. UserMemory schema migration applied via psql in a single transaction (12 column renames: wealth*→finances*, relationship*→relationships*, spirituality*→personal*, growth*→other*). LifeMapArea data migration: 12 rows rewritten Title-Case→UPPER_CASE with refreshed display name + color + icon; 5 stragglers from a third pre-existing seed vocabulary on Keenan's account ("Health & Fitness", "Career & Work", "Finance", "Learning & Growth", "Fun & Creativity") deleted; sortOrder re-aligned to the new canonical order. Code touched: shared constants + types, lifemap prompts (compression/insight/extraction), memory.ts, auth.ts createUser seed, /api/lifemap GET, web + mobile goal-list maps, web + mobile insights lookup (matches on `.enum` not `.name`), pipeline.ts extraction prompt schema. Backward-compat note: existing `Entry.rawAnalysis` JSON keys ("wealth"/"spirituality"/"growth") won't show up under the new lookup but prod has 2 test users with no real data so the cosmetic gap is acceptable; new entries write the new vocabulary correctly.
- **Inngest PR 4 (refresh-lifemap) shipped** (commit `55a436b`). Same pattern as PR 2 + PR 3. New `apps/web/src/inngest/functions/refresh-lifemap.ts` with `retries: 2` (user-interactive), per-user concurrency=1, **10-minute debounce per userId** (coalesces back-to-back refresh-button taps into one Claude pair). Two steps: `maybe-compress-memory` (conditional on `lastCompressed > 7d ago`) and `generate-insights`. `onFailure` logs only — refresh failures are non-disruptive (the user's existing Life Map remains in place; same button retries). `/api/lifemap/refresh` route gated dual-path: async returns 202 in <100ms, sync path preserved verbatim.
- **Inngest PR 3 (generate-weekly-report) shipped** (commit `fde08df`). Background-job retry semantics (`retries: 3`, per-user concurrency=1). Four steps: `record-run-id` (sets WeeklyReport.inngestRunId, flips status to GENERATING), `load-entries-for-week` (re-verifies ownership + min-3 entries, NonRetriable on insufficient), `generate-narrative` (Claude call), `persist-report` (status=COMPLETE). `onFailure` marks placeholder FAILED with errorMessage. `/api/weekly` route dual-path: async creates WeeklyReport QUEUED + dispatches event + returns 202; sync path preserved verbatim. Schema updates: `WeeklyReport` gained `errorMessage` + `inngestRunId` + status default flipped GENERATING→QUEUED + inline state-vocabulary comment (QUEUED|GENERATING|COMPLETE|FAILED). Applied to prod via `prisma db push` cleanly (3.95s). **Stale Claude model fix piggybacked**: `CLAUDE_MODEL` constant updated `claude-sonnet-4-5` → `claude-sonnet-4-6` (single-line change flows to extraction, weekly synthesis, memory compression, lifemap insights). Grepped tree for stragglers — none in code.
- **Inngest PR 2 (process-entry) shipped** (commit `de3ee8c`). 8-step processEntryFn ports the synchronous pipeline to Inngest with `retries: 2` (user-interactive), per-user concurrency=1, throttle 10/hr per user. Steps: record-run-id → download-audio → transcribe-and-persist-transcript → build-memory-context → extract → persist-extraction → update-user-memory → update-life-map. Memory + lifemap steps are catch-inline (set Entry to PARTIAL with reason on failure rather than failing the whole run); transcribe / extract / persist propagate to onFailure handler which maps to FAILED (no transcript) vs PARTIAL (transcript saved, downstream failed). `/api/record` route dual-path: async creates Entry QUEUED + uploadAudioBytes + dispatch event + return 202; sync path preserved verbatim. New `apps/web/src/lib/audio.ts` with `getEntryAudioPath(entry)`, `uploadAudioBytes()` (no signing — aligns with SECURITY_AUDIT §4), and `mimeTypeFromAudioPath(path)`. `EntryDTO` gained `audioPath` field; `/api/entries` selects both audioPath + audioUrl during deprecation window.
- **Schema expansion for Inngest async pipeline** (commit `6230348`). Entry gained `audioPath` (object path replacing the to-be-deprecated audioUrl), `errorMessage`, `partialReason`, `inngestRunId`. Status default `PENDING`→`QUEUED`. Inline comment documenting the full state vocabulary (QUEUED|TRANSCRIBING|EXTRACTING|PERSISTING|COMPLETE|PARTIAL|FAILED + legacy PENDING/PROCESSING). Applied via psql ALTER TABLE in one transaction (Prisma's binary hit a transient P1001 against the Supabase pooler; psql worked instantly on the same URL).
- **Inngest migration PR 1 (bootstrap) shipped.** Installs `inngest@^4.2.4` in the web workspace; creates `apps/web/src/inngest/client.ts` (singleton Inngest client, app id `"acuity"`), `apps/web/src/inngest/functions/hello-world.ts` (one trivial smoke-test function triggered by `test/hello` event), `apps/web/src/app/api/inngest/route.ts` (App Router handler that wraps `serve()` from `inngest/next` and exports `GET`/`POST`/`PUT`, gated by the `ENABLE_INNGEST_PIPELINE === "1"` feature flag — returns 503 otherwise so the route is safely inert by default); adds `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ENABLE_INNGEST_PIPELINE` to `.env.example` and to `turbo.json` `globalEnv`. Note: Inngest v4 (current) dropped the `EventSchemas`/`fromRecord<T>` typed-events API from v3 — the plan doc's client.ts example uses the v3 pattern. For PR 1 the client is untyped; typed events will come back when the full function suite lands (we can use per-function typed `event.data` or wait for a v5 Standard-Schema approach). The v4 `createFunction` signature is 2 args with `triggers: [{ event }]` in opts; updated accordingly. Typecheck passes; only remaining TS error in the tree is the pre-existing `lib/pipeline.ts:388` cast (AUDIT.md §3.8 adjacent — not touched in this PR). Manual setup steps for Jim checklisted in the new "Inngest Cloud Setup" section above.
- **Inngest migration plan** written to `./INNGEST_MIGRATION_PLAN.md`. Covers: current sync flow vs proposed async flow (diagrammed), Inngest setup (account + SDK + `/api/inngest` route + env vars), four function definitions (`processEntryFn` with 8 retryable steps, `generateWeeklyReportFn`, `refreshLifeMapFn`, `day14AuditCronFn` stub) + an `onFailure` catch-all, refactors of `/api/record` and `/api/weekly` to thin enqueue-and-return-202 shapes, client-side polling loop (recommended over Supabase Realtime for v1 — Realtime needs RLS which is blocked on Supabase access), `Entry.status` extended to `QUEUED | TRANSCRIBING | EXTRACTING | PERSISTING | COMPLETE | PARTIAL | FAILED` + new `errorMessage`/`partialReason`/`inngestRunId`/`audioPath` columns, feature-flag cutover via `ENABLE_INNGEST_PIPELINE` env var, "proven" criteria (7 days + 100 entries + forced-failure verification) before removing sync path, 10-PR migration sequence each testable in isolation, rollback plan (flip flag to 0 + cleanup query for orphaned QUEUED entries), and a §12 Hobby-viability check that walks every `/api/**` route — verdict: **Hobby is viable post-migration** if we enforce a 180s max server-side recording duration (keeps the transcribe step under Hobby's 10s per-step ceiling). Cost estimate: ~13.6K Inngest steps/month at 50-user beta scale, well within the 50K free tier; crossover to the $20/mo paid tier at ~180 users. Eight open questions flagged — none blocking for PR 1 (Inngest bootstrap with no behavior change).
- **Admin prerequisites verified against prod.** Linked repo to Vercel (`vercel link` → `keypicksems-projects/acuity-web` after switching to Keenan's Vercel login), pulled production env vars to `apps/web/.env.local` (gitignored correctly — `.env.*` rule in `.gitignore:14`). Ran `npx prisma db push` against prod Supabase: schema synced in 22.89s, no destructive-change warnings (the `isAdmin` column is nullable with a default). Verified via Prisma query against prod DB: User table has 2 rows (`jim@heelerdigital.com` + `keenan@heelerdigital.com`), both currently `isAdmin: false`. Jim flips his own flag manually via Supabase SQL editor. Separately: investigated the `/api/cron/waitlist-drip` invocation path (see Parked / Deferred above) — no scheduler wired anywhere.
- **Critical security fixes: admin auth (Next Up S1) + cron fail-closed (Next Up S6)** shipped on branch `fix/critical-security-admin-cron`. **Admin auth:** removed hardcoded `"acuity-admin-2026"` password from `apps/web/src/app/api/admin/dashboard/route.ts` and from the client page; added `isAdmin Boolean @default(false)` column to the `User` model in `prisma/schema.prisma` (not yet pushed — manual `prisma db push` step required). The API route now gates on NextAuth session + `isAdmin` lookup (401 if unauthenticated, 403 if not admin). The `/admin/dashboard` page is now a server component that `getServerSession`s, looks up `isAdmin`, and redirects to `/auth/signin` if logged out or `/dashboard` if logged in but not admin. UI moved to a new `admin-dashboard-client.tsx`; the old password form + sessionStorage cache are gone. **Cron fail-closed:** `/api/cron/waitlist-drip` returns 500 "Cron not configured" when `CRON_SECRET` env var is unset, 401 if header doesn't match. Grepped for other cron/admin-token fail-open patterns — none found (only one cron route exists in the repo). Branch pushed to GitHub but PR not opened yet (pending review of diff by Jim).
- **Security audit (public-beta readiness)** written to `./SECURITY_AUDIT.md`. Scope: RLS, API authorization/IDOR, service-role key exposure, audio bucket access, admin dashboard, NextAuth hardening, rate limiting, PII in logs, client-bundle leakage, account deletion. Three 🔴 CRITICAL findings block any public signup: (1) admin dashboard password `"acuity-admin-2026"` is hardcoded in source in a public repo (`apps/web/src/app/api/admin/dashboard/route.ts:4`) and the dashboard exposes real waitlist PII; (2) RLS status is unverifiable from the repo (no `supabase/` folder, no SQL policies, Prisma bypasses RLS via service-role connection) — needs live Supabase inspection before opening signups; (3) no account-deletion path anywhere in the codebase — GDPR Art. 17 / CCPA §1798.105 non-compliant the moment real signups start, and cascade is broken on six child relations so even a manual user delete would leave orphan rows. Also: `/api/cron/waitlist-drip` is fail-open if `CRON_SECRET` is unset (🟠), zero rate limiting anywhere (🟠), waitlist route logs PII to Vercel logs on every signup (🟠), admin-notification email HTML-injects user-supplied `name` (🟡), audio bucket state unconfirmed + signed URLs stored in DB expire after 1h with no re-sign route (🟠). Good news: every per-user API route enforces ownership correctly (no IDOR), service-role key is server-only today, no secrets in the client bundle, NextAuth defaults (HttpOnly/SameSite/Secure cookies, CSRF double-submit) are preserved. Full §11 prioritized fix list in the doc.
- **Credential leak audit** written to `./CREDENTIAL_LEAK_AUDIT.md`. Scope: `apps/web/.env.local.save` at commit `799a635` (2026-04-13, public repo). Findings: exactly one credential had a populated value — the Supabase DB password `KeenanJim525$` for project `rohjfcenylmfnqoyoirn`, appearing twice in raw connection strings prepended to line 1. Every other key in the file was an empty placeholder. No other `.env*` file has ever been committed besides `.env.example` (clean). `.gitignore` pattern `.env.local` is a literal match and does NOT cover `.env.local.save` — root cause. Recommended replacement: `.env` + `.env.*` + `!.env.example`. Full per-key classification + rotation order in the doc. Rotation queued in Next Up; Jim + Keenan do it manually.

### 2026-04-18
- **`.gitignore` hardened + gitleaks pre-commit hook installed.** Env block replaced with `.env` / `.env.*` / `!.env.example` (closes the `.env.local.save` loophole). Added AUDIT.md §8 patterns: `*.pem`, `*.p12`, `*.key`, `credentials.json`, `token.json`, `google-services.json`, `GoogleService-Info.plist`, `*.tfvars`. Husky 9 wired up at repo root; `.husky/pre-commit` invokes `gitleaks protect --staged` against `.gitleaks.toml` (extends gitleaks defaults + stack-specific rules for Anthropic, Resend, Supabase JWT, Postgres DSNs with inline passwords, Google OAuth `GOCSPX-`, Expo/EAS tokens, strict `AKIA…` AWS IDs). Verified: staging a file containing AWS's documented dummy access key (the one with the `…EXAMPLE` suffix AWS publishes for docs) and attempting `git commit` → hook exits 1, `leaks found: 1`. Test file deleted afterward.
- **Paywall plan rev 3** — all five pre-flight questions resolved. Analytics = PostHog. Tests = Vitest. No user backfill (no real users exist). Mobile keeps web redirect; `?src=mobile_profile` instrumented anyway for cross-surface measurement when IAP lands. Degraded Day 14 Life Audit fallback is full-template with no Claude call; hard-coded closing paragraph drafted inline in plan §7.3. Sequencing dropped the backfill step. `IMPLEMENTATION_PLAN_PAYWALL.md` is execution-ready behind the Inngest prerequisite.

### 2026-04-17
- **Paywall plan rev 2** — Jim approved with modifications. Added §7 (rollback for Life Audit failures: 48h extension + degraded fallback), §8 (6 required analytics events), §9 (Vitest full-matrix tests), §10 (price + push deferred). Overrode §5.5 (interstitial instead of disabled button for post-trial Life Map refresh). Rewrote §4.1 to embed hand-crafted example as a few-shot inside the Life Audit system prompt. Made Inngest migration a hard prerequisite in §5.8.
- **Soft-transition paywall implementation plan** written to `./IMPLEMENTATION_PLAN_PAYWALL.md`. Key finding while planning: the paywall effectively does not exist yet — `subscriptionStatus` is written by the Stripe webhook but never read as a gate anywhere, `trialEndsAt` is never populated, the Day 14 Life Audit generator doesn't exist, and the Stripe checkout's `trial_period_days: 7` conflicts with the upgrade-page copy's "14-day free trial." Plan covers entitlements helper, write-endpoint gating (not middleware), new `LifeAudit` + `Memoir` models, and concrete copy drafts.
- **Deep codebase audit** written to `./AUDIT.md` (Claude Opus 4.7). Covers architecture, per-feature build state, bugs/security, schema/DB, mobile TestFlight readiness, dependencies. 15 prioritized items; top of the list is rotating the leaked Supabase DB password.
- GitHub repo transferred to `jimheelerdigital`.
- Repo cloned locally to `~/Projects/Acuity`.
- VS Code opened on project.
- **[Pre-handoff, per Project Brief]** — Monorepo scaffold, Prisma schema, Supabase setup
- **[Pre-handoff]** — Next.js web: auth (Google + magic link) + middleware
- **[Pre-handoff]** — Web recording screen + `/api/record` route (Whisper + Claude pipeline)
- **[Pre-handoff]** — Task manager, Goals tracker, Insights page
- **[Pre-handoff]** — Weekly report generation + report card display
- **[Pre-handoff]** — Stripe checkout + webhook handler + paywall logic
- **[Pre-handoff]** — Expo mobile app: scaffold, auth, tab navigator
- **[Pre-handoff]** — 5 targeted landing pages + waitlist system
- **[Pre-handoff]** — Cloudflare DNS + Resend email verification

---

## Next Up (Priority Order)

### 🔴 Security — must ship before ANY public signup (from SECURITY_AUDIT.md §11)

~~S1.~~ ✅ **DONE 2026-04-19** — admin dashboard now gates on NextAuth session + `isAdmin` flag. Branch `fix/critical-security-admin-cron` pushed, PR pending review. Follow-ups required: (a) `npx prisma db push` once Supabase access is restored, (b) manually `UPDATE "User" SET "isAdmin" = true WHERE email = 'jim@heelerdigital.com';` for Jimmy's own account.
S2. **Verify Supabase RLS live.** Confirm RLS enabled + policies shipped on `User`, `Account`, `Session`, `VerificationToken`, `Entry`, `Task`, `Goal`, `WeeklyReport`, `LifeMapArea`, `UserMemory`, `Waitlist`. Screenshot and paste into a follow-up doc.
S3. **Ship account deletion.** New `DELETE /api/user/me` that purges every user-scoped table in a transaction + deletes the Supabase Storage `voice-entries/${userId}/*` prefix + archives the Stripe customer. Add `onDelete: Cascade` on the six child relations so the transaction works.
S4. **Audio bucket privacy.** Confirm `voice-entries` bucket is private. Add storage RLS scoped to `${userId}/` prefix. Store object path (not signed URL) in `Entry.audioUrl`; add authenticated route that re-signs on demand with ≤5-min TTL.

### 🟠 Security — must ship before public beta launch

S5. Rate limiting (`@upstash/ratelimit`) on `/api/record`, `/api/weekly`, `/api/lifemap/refresh`, `/api/auth/signin` (email), `/api/waitlist`.
~~S6.~~ ✅ **DONE 2026-04-19** — `/api/cron/waitlist-drip` is now fail-closed. `CRON_SECRET` must be set in Vercel Production or the route returns 500 (verify env var exists).
S7. Strip PII-logging `console.log` calls from `/api/waitlist/route.ts` (lines 9, 10, 17, 27, 29, 33, 41, 45, 54, 57, 59, 83, 84, 93, 95, 99, 102, 111).
S8. HTML-escape `name`/`email`/`source` in the waitlist admin-notification email template.
S9. Rename `apps/web/src/lib/supabase.ts` → `supabase.server.ts` with `server-only` import.

### Infrastructure / paywall path (pre-existing)

1. Purge `apps/web/.env.local.save` from git history (BFG or `git filter-repo`); force-push. Hygiene only — rotation is the actual fix because the repo was public.
2. Pull env vars from Vercel (`vercel env pull`).
3. Get web app running locally (`npm install` → `npm run dev`)
4. Push pending Prisma schema changes (`UserMemory`, `Waitlist`)
5. Verify Stripe webhook is live and pointed at `https://getacuity.io/api/stripe/webhook`.
6. **Inngest setup — migrate AI pipeline to background jobs.** HARD PREREQUISITE for the paywall plan below; Day 14 cron cannot ship reliably without it. **Plan:** `INNGEST_MIGRATION_PLAN.md` (2026-04-19) — 10 PRs, first is a no-behavior-change bootstrap. All §14 open questions resolved 2026-04-19. **Status:** PR 1 (bootstrap) shipped. PR 2 (define `processEntryFn` unwired) is next, gated on the "Inngest Cloud Setup" checklist above being completed.

### Paywall soft-transition implementation (from `IMPLEMENTATION_PLAN_PAYWALL.md` §5.8, rev 3)

Executes AFTER Inngest migration (step 6) is green on staging:

7. Set `trialEndsAt` in NextAuth `createUser` event; remove Stripe `trial_period_days`. No user-facing change. **No backfill.**
8. Add `LifeAudit` + `Memoir` Prisma models (plus `degraded` column + `trialEndsAtExtendedBy` on User); push to DB.
9. Wire PostHog SDKs (web + mobile + server); fire `trial_started` from `createUser`.
10. Build Life Audit generator, route, view page. Rendered to trial users only. Still no gating. Wire `life_audit_generated` + `life_audit_viewed`.
11. Add `entitlementsFor()` helper + Vitest unit tests covering the full §3 matrix + rollback cases. Tests pass before enforcement lands.
12. Enforce entitlements at the 4 write endpoints (`/api/record`, `/api/weekly`, `/api/life-audit`, `/api/lifemap/refresh`). Wire `?src=paywall_redirect`. Ghost-state annotations on history charts. Life Map interstitial for post-trial users.
13. Rewrite `/upgrade` page copy (two variants); wire `upgrade_page_viewed` + `upgrade_page_cta_clicked`; wire `subscription_started` in Stripe webhook. Add `?src=mobile_profile` to mobile upgrade button.
14. Inngest cron for Day 14 Life Audit pre-generation; full-template degraded fallback (hard-coded closing from plan §7.3); rollback path in the same PR.
15. Post-trial email campaign.

### Rest of the path to TestFlight

16. Build onboarding flow per onboarding spec (biggest chunk of work).
17. Decide Apple IAP strategy; implement RevenueCat if chosen.
18. EAS iOS build → TestFlight.
19. App Store Connect listing prep (privacy policy — include PostHog as sub-processor; App Privacy questionnaire; screenshots; description; permissions strings).

---

## Inngest Cloud Setup (action items — check off as completed)

PR 1 (code) is shipped, but Inngest doesn't do anything in production until this list is done.

**1. Create the Inngest Cloud account**
- [ ] Sign up at https://app.inngest.com/sign-up using `jim@heelerdigital.com`.
- [ ] Accept the terms; no credit card required for the Free tier.

**2. Create the Acuity app**
- [ ] Apps → + New App → name it `acuity` (must match `new Inngest({ id: "acuity" })` in `apps/web/src/inngest/client.ts`; renaming orphans history).
- [ ] Two environments should exist automatically: **Production** and a **Branch/Preview** environment. If only Production exists, create a Branch environment under the Environments tab — Inngest routes events by environment keyed off our deployment URL.

**3. Grab the keys from each environment**

Inngest dashboard → Apps → `acuity` → pick the environment → Settings → Keys.

Paste the values below as you collect them so future sessions can confirm which env matches which key. **Never commit populated values** — the gitleaks hook will block it.

_Production:_
- `INNGEST_EVENT_KEY` = ______________________________
- `INNGEST_SIGNING_KEY` = ______________________________

_Branch / Preview:_
- `INNGEST_EVENT_KEY` = ______________________________
- `INNGEST_SIGNING_KEY` = ______________________________

**4. Push the env vars into Vercel**

```
vercel env add INNGEST_EVENT_KEY      production
vercel env add INNGEST_SIGNING_KEY    production
vercel env add INNGEST_EVENT_KEY      preview
vercel env add INNGEST_SIGNING_KEY    preview
```

Leave `ENABLE_INNGEST_PIPELINE` **unset** or set to anything other than `"1"` until we're ready to activate. While unset, `/api/inngest` returns 503 "Inngest pipeline not enabled" on every invocation — the endpoint is safely inert.

**5. Register the deployment with Inngest**
- [ ] After a Vercel deploy with the three keys set, Inngest dashboard → Apps → `acuity` → Sync should auto-detect the `/api/inngest` handler. If it doesn't, trigger manual sync with the deployment URL.

**6. Flip the feature flag to activate (when ready for the smoke test)**
- [ ] `vercel env add ENABLE_INNGEST_PIPELINE production` → value `1`, redeploy.
- [ ] Send a test event from Inngest dashboard → Events → Send Event → name `test/hello`, data `{"message": "hello world"}`.
- [ ] Confirm the `hello-world` function run appears in the dashboard with the "log-greeting" step completed and the return value `{ ok: true, greeting: "Hello from Inngest: hello world" }`.

**7. Local dev**

For local development, set `ENABLE_INNGEST_PIPELINE=1` and either `INNGEST_DEV=1` (points events at the dev server) or copy the preview-env keys into `.env.local`. Run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` in a second terminal — the dev UI is at http://localhost:8288.

---

## Notes for Future Sessions

- **Git workflow (set 2026-04-19):** default is to commit and push directly to `main`. Run `git pull --ff-only origin main` at the start of every session before making changes. Only create branches or open PRs when Jim explicitly asks for one.
- This repo is a Turborepo monorepo: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared` (types/utils), `prisma/` (DB schema).
- Production domain is `getacuity.io` — deployed via Vercel (GitHub integration).
- Waitlist is live and collecting.
- Meta Pixel ID: `5752790988087389` — installed on landing pages.
- **`CREDENTIAL_LEAK_AUDIT.md` (2026-04-19)** is the per-key audit for the `.env.local.save` leak at commit `799a635`. Only one credential had a populated value (Supabase DB password); it has been rotated. The 23 other keys in the file were empty placeholders — no rotation needed on those. Residual concern (project ref exposure) accepted per 2026-04-18 decision.
- **`AUDIT.md` (2026-04-17)** is the authoritative current-state-of-the-codebase document. Read it before changing anything non-trivial. It catalogs architecture, per-feature build state, bugs, schema concerns, TestFlight blockers, and dependency drift, all with file:line references.
- **`INNGEST_MIGRATION_PLAN.md` (2026-04-19)** is the plan for moving the AI pipeline from synchronous Vercel functions to Inngest background jobs. Hard prerequisite for the Day 14 audit cron in the paywall PR (`IMPLEMENTATION_PLAN_PAYWALL.md` §5.1) and for moving the project off Vercel Pro onto Hobby. Read §11 for the 10-PR ship sequence (PR 1 is a no-behavior-change bootstrap), §12 for the Hobby-viability check per-route, and §14 for the 8 open questions that need Jim's input before PR 2.
- **`IMPLEMENTATION_PLAN_PAYWALL.md` (2026-04-18, rev 3)** is the execution-ready plan for the soft-transition paywall. All pre-flight questions resolved. Includes: exact `entitlementsFor()` rule (§3), file-by-file change list (§1), new schema models (§2 + §7 additions: `LifeAudit`, `Memoir`, `degraded` col, `trialEndsAtExtendedBy` on User), Life Audit few-shot prompt (§4.1), `/upgrade` page with `{{PRICE_PER_MONTH}}` template (§4.2), post-trial email (§4.3), rollback plan with hard-coded degraded closing paragraph (§7.3), PostHog event schema (§8), Vitest full-matrix coverage (§9), and deferred items including iOS App Privacy declarations (§10). **Inngest migration is a hard prerequisite** — do not start the paywall work until Inngest is shipped. Read §5.8 for the full sequenced ship order.
- **Three trial-length values don't agree today** (flagged in the paywall plan §0.3): Stripe checkout uses 7 days, `/upgrade` page copy says 14 days, schema default is `"TRIAL"` with `trialEndsAt` null. Decision says 14 days is canonical.
- **The Day 14 Life Audit does not exist** in code (only in marketing copy). Must be built as part of the paywall PR so the soft transition has a place to live.
