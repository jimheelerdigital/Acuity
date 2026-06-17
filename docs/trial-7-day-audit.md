# Trial 14-day → 7-day migration — Step 1 Audit

**Date:** 2026-06-17 · **Branch:** `feat/trial-7-days` · **Step 1 only — no code changed.**

> ⚠️ **Spec not found:** `docs/specs/trial-7-day-spec.md` does not exist in the repo yet. This audit is the grep-sweep deliverable (independent of the spec) + flags the **open questions the spec must answer** before Step 2. Save the spec and I'll reconcile.

## Headline findings
1. **No single source of truth for trial length.** There is no `TRIAL_DAYS` constant — the literal `14` is duplicated across **4 code paths** (`bootstrap-user.ts`, `signup/route.ts`, `mobile-signup/route.ts`, `onboarding/create-checkout/route.ts`). **Step 2 should introduce one constant** (e.g. `TRIAL_DAYS = 7` in `@acuity/shared/constants.ts`, alongside the existing `CLAUDE_MODEL`) and point all paths at it, so this never re-scatters.
2. **The trial *lifecycle* is calibrated to 14, not just the length.** The **Day-14 Life Audit** and the **T-7 / T-3 / T-1 countdown emails** assume a 14-day window. At 7 days, "T-7" lands on signup day (nonsensical) and "Day 14 audit" is a week after the trial ends. **These need spec decisions, not a find-replace.**
3. Many `14`/`two-week` references are **unrelated to trial length** (insight digests, post-expiry UI window, GDPR, streak milestones, blog habit copy) and **must NOT change**.

---

## A. Trial-length CODE — change `14 → 7` (the actual length)

| File:line | Reference | Note |
|---|---|---|
| `apps/web/src/lib/bootstrap-user.ts:70,316` | `trialDaysForEmail(email)` base value (14) + reduced re-signup value (3) | The OAuth/createUser trial-grant resolver. Base 14→7. **Re-signup reduced (3): keep 3 or scale? → spec.** |
| `bootstrap-user.ts:83` | `FOUNDING_MEMBER_TRIAL_DAYS = 14` | Founding-member trial → 7? **spec** |
| `bootstrap-user.ts:94` | `trialDays = base + (referredById ? 14 : 0)` | Referral bonus = +14 days. → +7? **spec** (also see `lib/referrals.ts:55,60` "extend trialEndsAt by 14 days") |
| `bootstrap-user.ts:95` | `trialEndsAt = now + trialDays * 86400000` | Computed from `trialDays` — fixed once the above are |
| `bootstrap-user.ts:142` | `reducedTrial: trialDays < 14` | Threshold must follow the new base (`< 7`) |
| `apps/web/src/app/api/auth/signup/route.ts:136` | `defaultTrialEnd = new Date(now + …)` | **Separate inline computation** (web email signup) — verify literal + change |
| `apps/web/src/app/api/auth/mobile-signup/route.ts:103` | `defaultTrialEnd = new Date(now + …)` | **Separate inline computation** (mobile email signup) — change |
| `apps/web/src/app/api/onboarding/create-checkout/route.ts:9,80` | `trial_period_days: trialDays` + comment "Trial length: 14 days for all users" | **Stripe** checkout trial — must match app trial length |
| `scripts/seed-test-user.ts:25-26,146` | `getDate() + (14 - daysIntoTrial)` + flag docs | Test tooling — update for consistency |
| `lib/referrals.ts:55,60` | referral grants/extends trial by 14 days | Referral bonus length — tie to the new constant |

## B. Trial LIFECYCLE timing keyed to "Day 14" — **needs spec decision (not find-replace)**

| File | Behavior | 7-day implication |
|---|---|---|
| `apps/web/src/inngest/functions/day-14-audit-cron.ts` | Generates the **Life Audit at day 14** (end of trial) | At 7-day trial, audit should fire at **day 7** (end). Rename/retime. **spec** |
| `apps/web/src/lib/trial-countdown-emails.ts:11-13` | Cadence **T-7 / T-3 / T-1** ("trial ends in a week" / "3 days left" / "last day") | **T-7 breaks** — it'd fire on signup day. New cadence (e.g. T-3/T-1, or T-5/T-2/T-1)? **spec** |
| `trial-countdown-emails-cron.ts`, `trial-countdown-push-cron.ts` | Schedule the above relative to `trialEndsAt` | Follow the new cadence |
| `trial-expiration-cron.ts` | Flips `TRIAL → FREE` when `trialEndsAt` passes | **Length-agnostic (reads `trialEndsAt`) — no change needed** ✓ |
| `step-8-trial.tsx` / `step-7-trial-explanation.tsx` | "On **Day 14** you get your Life Audit" | Copy + the audit-day reference → day 7 |

## C. COPY — change to 7 days (user-facing)

| File:line | String |
|---|---|
| `apps/mobile/app/(auth)/sign-up.tsx:141` | "14-day free trial. No credit card." |
| `apps/web/src/components/onboarding-funnel.tsx:2278` | "14-day free trial included with all plans…" |
| `apps/web/src/components/onboarding-funnel.tsx:2335` | "You have 14 days to explore everything Acuity offers." |
| `apps/mobile/components/onboarding/step-8-trial.tsx:12,67,68,76` | "14 days free", "On Day 14 you get your Life Audit", "first two weeks", title "14 days free" |
| `apps/web/src/components/content-factory/previews/AdCopyPreview.tsx:49` | "Try free for 14 days" |
| `apps/web/src/lib/content-factory/generate.ts:30` | "$4.99/month after 14-day free trial…" (AI prompt template) |
| `apps/web/src/inngest/functions/auto-blog.ts:1247,1277` | "after 14-day free trial" / "Try Acuity free for 14 days" (AI blog prompt) |
| Marketing pages (contain `14`, verify each at Step 2): `app/page.tsx`, `app/voice-journaling/page.tsx`, `app/upgrade/upgrade-plan-picker.tsx`, `app/onboarding/steps/step-7-trial-explanation.tsx`, `app/auth/signup/page.tsx`, `app/account/_components/trial-status-card.tsx`, `app/auth/signup/success/try-session-claimer.tsx` | various "14-day"/"14 days" CTAs |

> Per `docs/acuity-positioning.md`, trial copy must stay on-brand and avoid recording-duration claims; the "$4.99/mo, 14-day trial" pricing line appears in several AI-generation prompts — update those templates too or the blog/ad generators will keep emitting "14-day".

## D. UNRELATED `14`/`two-week` — **DO NOT change**

- `compute-user-insights.ts` — the **14-day insight digest** window (Claude weekly observer reads last 14 days). Unrelated to trial.
- `free-cap-evaluator.ts:37` — trailing-14-day cadence **metric** window.
- `components/acuity/SubscriptionPill.tsx:52,77` + `schema.prisma:1965` — **~14-day post-expiry** UI window (pill stays expressive after trial ends). *Loosely trial-adjacent — confirm at Step 2 whether it should track the new length.*
- GDPR "14-day withdrawal" (`rls-allowlist.txt:27`, ConsentRecord) — legal, unrelated.
- `STREAK_MILESTONES = [3,7,14,30,…]` — streak ladder, unrelated.
- `lib/blog-posts.ts` "two weeks" (×4) — journaling-**habit** copy, not trial. Leave.
- `scripts/seed-app-store-reviewer.ts` "fourteen-hour day" — transcript fixture. Leave.

## E. AMBIGUOUS — **spec must decide**
- **"Getting to know Acuity" 14-day discovery/progression checklist** (`packages/shared/src/progression.ts:2,23`, `schema.prisma:575`, `components/progression-checklist.tsx:13`, mobile `progression-checklist`). The guided-unlock experience runs over **14 days**. If the trial shrinks to 7 but the discovery schedule stays 14, **unlocks extend a week past trial end**. Compress to 7, or keep at 14 (decoupled from billing)? *Note: progression unlocks are described as experiential gates, not billing gates — so they may legitimately stay 14.*
- Day-14 Life Audit timing + the email/push cadence (Section B).
- Referral / founding-member / reduced-resignup trial lengths (Section A) — scale proportionally or keep absolute?

---

## Recommended Step 2 shape (for when the spec lands)
1. Add `TRIAL_DAYS = 7` to `@acuity/shared` constants; replace the 4 inline `14`s (A) with it. Decide referral/founding/reduced values.
2. Resolve the lifecycle (B) per spec: retime the audit to trial-end, rework the countdown cadence for a 7-day window.
3. Update all copy (C) to "7-day"/"7 days"/"Day 7" — including the AI-generation prompt templates.
4. Leave D untouched; decide E.
5. No migration needed — `trialEndsAt` is a per-user timestamp; only **new** signups get 7 days. Existing trials keep their dates unless a backfill is specified.
