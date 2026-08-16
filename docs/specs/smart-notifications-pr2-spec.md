# Smart Notifications — PR 2: scheduling + email send infrastructure

**Date:** 2026-06-23 · **Status:** Plan (no code) · **Owner:** Jimmy
**Depends on:** PR #15 (merged) — `UserNotificationPreferences`, `@acuity/shared` categories, prefs UI.
**Master spec:** `docs/specs/smart-notifications-spec.md` (§3 scheduling, §7 tracking, locked decisions).

**One-line:** an hourly Inngest cron that, per eligible user, evaluates trigger conditions, picks the single best candidate, and sends a **static-template email** — gated by quiet hours, frequency caps, the 18h floor, "recorded today," and smart timing. **Email-only. Default-ON categories only. No AI, no inferred content** (those wait for PR 3's safety filter).

---

## Part A — Audit: what we reuse (all confirmed in-repo)

### A1. Inngest cron infrastructure ✅ reuse directly
- **Client:** `apps/web/src/inngest/client.ts` (app id `"acuity"`).
- **Serve route:** `apps/web/src/app/api/inngest/route.ts` — all functions registered in the `functions:[]` array; `maxDuration = 300` (Vercel Pro 5-min cap); auto-syncs to Inngest Cloud on deploy (GET to the serve route). **No manual resync.** `ENABLE_INNGEST_PIPELINE` is legacy and does **not** gate crons.
- **Functions dir:** `apps/web/src/inngest/functions/` (39 functions today).
- **Direct precedents for "hourly local-time scan + dedup"** (mirror these, do not reinvent):
  - `notifications-twice-daily.ts` — hourly cron, sends 9am/8pm reminders **timezone-aware via `User.timezone`** (closest analog).
  - `weekly-digest.ts` / `monthly-digest.ts` — hourly cron, "find users at local Sunday/1st 9am, send if ≥N entries and not sent in 6d" (the local-time gate + DB-sentinel dedup pattern).
  - `trial-email-orchestrator.ts` — hourly cron, **batches 20 users per `step.run()`** for timeout isolation; idempotency via a log table.
- **Cron shape to copy:**
  ```ts
  export const smartNotificationsCron = inngest.createFunction(
    { id: "smart-notifications-cron", name: "Smart notifications (email)", triggers: [{ cron: "0 * * * *" }], retries: 2 },
    async ({ step, logger }) => { /* fetch candidates → batch in step.run → send → log */ }
  );
  ```
  Register it in `app/api/inngest/route.ts`.

### A2. Email send ✅ reuse directly
- **Provider:** Resend. Client `apps/web/src/lib/resend.ts` → `getResendClient()`; `RESEND_API_KEY`; `EMAIL_FROM` (default `"Acuity <hello@getacuity.io>"`).
- **Send call shape:** `resend.emails.send({ from, to, subject, html, headers })` (see `lib/trial-countdown-emails.ts`, `emails/weekly-digest.ts`).
- **Templates:** raw-HTML-string functions `(vars) => { subject, html }`, wrapped with `emails/trial/layout.ts` helpers `trialLayout()` / `trialButton()` / `trialCard()`. New engagement templates live in a new `apps/web/src/emails/notifications/` dir, reusing `trialLayout`.
- **Send logging + open/click tracking:** `TrialEmailLog` + the Resend webhook `apps/web/src/app/api/webhooks/resend/route.ts` (matches on `resendId`, writes `opened/openedAt/clicked/clickedAt`). **We will generalize this** — see A2-note.
- **Unsubscribe:** signed HMAC tokens via `lib/email-tokens.ts` `signUnsubscribeToken(userId, kind)`; route `app/api/emails/unsubscribe/route.ts`; kinds today = `weekly|monthly|onboarding|waitlist`. Digest emails set the `List-Unsubscribe` one-click header.
- **Throttle precedent:** recovery cron checks a 24h global cooldown via the log table.

> **A2-note (decision needed → see Q6):** the open/click webhook currently only updates `TrialEmailLog`. For notification opens/clicks we either (a) extend the webhook to also match a new `NotificationLog.resendId`, or (b) widen the webhook to a shared lookup. Recommend (a) — small, additive.

### A3. User timezone ⚠️ usable, with a gap
- `User.timezone String @default("America/Chicago")` ✅ exists and is already used for local-day bucketing (`lib/streak.ts` `formatInTimeZone`). `UserNotificationPreferences.timezone String?` (override).
- **Gap:** there's no confirmed capture path that overwrites the `America/Chicago` default for non-US users — so a non-US user may be bucketed to Central time. Effect: quiet hours + smart timing could be off by hours for them.
- **Resolution for PR 2:** resolve send-time tz as `COALESCE(prefs.timezone, user.timezone, "America/Chicago")`. **Add a lightweight capture** in PR 2: the web prefs page + mobile screen send the device IANA tz (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to the prefs `PUT` (writes `UserNotificationPreferences.timezone`). Cheap, removes the gap for anyone who opens settings. Flag remaining users as "best-effort default tz."

### A4. Smart timing ✅ derivable (needs a raw query)
- `Entry.createdAt` (UTC, indexed `(userId, createdAt)`). No stored "preferred hour."
- **Modal local hour over 30d** (Prisma can't express `AT TIME ZONE` cleanly → use `$queryRaw`):
  ```sql
  SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE $tz))::int AS hr, COUNT(*) AS n
  FROM "Entry"
  WHERE "userId" = $userId AND "createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY hr ORDER BY n DESC, hr DESC LIMIT 1;
  ```
- **Fallback** when <5 entries in 30d: use `User.notificationTime` if set, else a sensible default (e.g. 19:00 local), always clamped outside quiet hours.
- **Perf:** computing this per user per hour is wasteful. Recommend caching the modal hour (see Q-perf) — a denormalized `preferredHourLocal Int?` on `UserNotificationPreferences`, recomputed daily by a cheap step (or lazily, ≤ once/24h).

### A5. The 18h gate ✅
- `UserNotificationPreferences.lastNotifiedAt DateTime?` exists. Enforce transactionally with a **conditional `updateMany`** (the trial-cron idempotency pattern): only "claim" a send if `lastNotifiedAt IS NULL OR < now-18h`; if the update count is 0, another tick already claimed it → skip. Update `lastNotifiedAt = now` in the same claim.

### A6. Category-enabled check ✅
- `UserNotificationPreferences.enabledCategories String[]` + `@acuity/shared` `isNotificationCategory()` and `DEFAULT_ENABLED_CATEGORIES`. Check = `prefs.enabledCategories.includes(category)`. (Add a tiny shared helper `isCategoryEnabled(prefs, category)` for clarity.)

### A7. Trigger-data confirmation ✅ (all fields exist)
- Streak: `User.currentStreak`, `longestStreak`, `lastSessionDate`, `lastStreakMilestone`, `totalRecordings`, `lastSeenAt`; `lib/streak.ts` `MILESTONES = [7,30,100]`.
- Goal: `status` (NOT_STARTED|IN_PROGRESS|ON_HOLD|COMPLETE|ARCHIVED), `lastMentionedAt`, `title`, `createdAt`.
- Task: `status` (OPEN|DONE), `entryId` (→ Entry.createdAt), `dueDate`, `snoozedUntil`, `completedAt`.
- Theme/ThemeMention: `ThemeMention.sentiment` (POSITIVE|NEUTRAL|NEGATIVE), `createdAt`, indexed `(themeId, createdAt)`.
- LifeMapArea: `score100`, `weeklyDelta`, `monthlyDelta`, `trend`; `LifeMapAreaHistory(area, score, weekStart)`.
- Achievement: `UserAchievement.earnedAt`, `shownToUser`, indexed `(userId, earnedAt)`.

---

## Part B — Proposed architecture

### B1. Trigger system — hourly cron
`{ cron: "0 * * * *" }`. Rationale: matches the existing digest/notification crons; the 18h floor + ≤1/day caps mean sub-hourly granularity buys nothing; hourly is enough to hit each user's preferred local hour. (See Q1.)

### B2. Per-user evaluation pipeline (in order; first failure short-circuits → log `skipped` + reason)
1. **Prefs row exists** (defensive — lazily created on prefs read, but cron must not assume).
2. **`emailEnabled` true** (email is the only channel in PR 2).
3. **Not paused:** `pausedUntil` null or ≤ now.
4. **Frequency cap** by plan: FREE → ≤ `maxPerWeek` (default 1) in trailing 7d; PRO/TRIAL → ≤ `maxPerDay` (default 1) in local day. Counted from `NotificationLog`. (Plan via `User.subscriptionStatus`.)
5. **18h floor:** `lastNotifiedAt` null or < now−18h.
6. **Quiet hours:** current local time not within `[quietHoursStart, quietHoursEnd)` (wraps midnight).
7. **Smart-timing window:** current local hour == user's target hour (modal-30d or fallback), clamped outside quiet hours. (Streak/milestone may bypass the exact-hour match — see B3.)
8. **Recorded today?** If an `Entry` exists for the user in the local day, suppress habit/streak nudges (they've already engaged); milestone may still fire.
9. **Eligible categories** = `enabledCategories ∩ {PR-2 shipping set}` (see Part D).
10. **Evaluate trigger conditions** (Part C) for each eligible category → candidate list.
11. **Pick one** by priority (B3). If none, log `skipped: no_candidate`.
12. **Claim + send + log** (B5).

### B3. Candidate priority (when multiple fire)
`milestone_celebration` → `streak_preservation` → `task_reminder` → `goal_nudge` → `theme_followup` → `life_area_check` → `habit_reminder` (pure fallback). Rationale: celebrate fresh wins first (they decay), then save an at-risk streak (expires tonight), then content nudges by specificity, with the contentless habit reminder last. **In PR 2 the live subset is just `milestone → streak → habit`.**

### B4. Send method — email only
Resend via a new `lib/notifications/send-notification-email.ts` wrapping `resend.emails.send`, mirroring `sendCountdownEmail`. Push send is **not** built here (PR 5); the engine writes `channel: "email"` only.

### B5. Idempotency + logging → new `NotificationLog` table
Needed in PR 2 for dedup, the frequency cap count, and the open/click webhook mapping (it also becomes PR 4's analytics substrate).
```prisma
model NotificationLog {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  category        String                       // NotificationCategory key
  channel         String    @default("email")  // "email" | (future) "push"
  templateVariant String?                       // which of the N rotated templates
  refId           String?                       // e.g. UserAchievement.id for milestone dedup
  localDay        String                        // "YYYY-MM-DD" in the user's tz at send (dedup key)
  status          String    @default("sent")    // "sent" | "skipped" | "failed"
  skipReason      String?
  resendId        String?   @unique             // ties Resend open/click webhook back to this row
  opened          Boolean?  
  openedAt        DateTime?
  clicked         Boolean?
  clickedAt       DateTime?
  sentAt          DateTime  @default(now())
  @@unique([userId, category, localDay])        // DB-enforced "same category once per local day"
  @@index([userId, sentAt])
  @@index([userId, category, sentAt])
}
```
- The `@@unique([userId, category, localDay])` makes double-send within a day impossible even under overlapping ticks/retries (insert conflict → skip).
- **Skips:** logging skip rows is optional in PR 2 (volume). Recommend logging skips **only** behind a debug flag or sampled; the analytics `notification_skipped` event (PR 4) can carry reasons without a DB row per skip.

### B6. Content — static templates, rotated
- **Per category, 5 hand-written variants** (see Q4) chosen by a stable rotation: `variantIndex = hash(userId + localDay) % 5` so a user doesn't see the same line twice in a row but it's deterministic per day.
- Templates obey master-spec copy rules (≤ ~80 chars subject-ish, sentence case, mirror-not-coach, no fake urgency, no emoji spam) and use `trialLayout` + a single deep-link button (App Store / app deep link / web debrief per the install work).
- **PR-2 categories reference NO inferred content** (streak count, milestone name, generic habit nudge only) — so no safety filter is required to ship them. Tone (`caring`/`direct`) selects between two phrasings per variant.

### B7. Tracking (PR 2 minimum; full set in PR 4)
- PR 2 writes `NotificationLog` rows (sent) + extends the Resend webhook to set `opened/clicked` on `NotificationLog`.
- PR 4 layers the PostHog event set (`notification_scheduled/sent/skipped/opened/caused_entry`) + MRI dashboard. PR 2 can fire `notification_sent` opportunistically if cheap, but the durable record is the log table.

### B8. Email footer / respect controls
Every notification email includes: a **"Manage notifications"** link → the prefs page (`/account#notifications`); a **List-Unsubscribe** one-click header that sets `UserNotificationPreferences.emailEnabled = false` (new unsubscribe kind `"engagement_notifications"` in `email-tokens.ts` + the unsubscribe route); and a **"Turn off [category]"** one-tap signed link that removes that one category from `enabledCategories` (the master spec §6 "Stop notifications like this"). *(If scope tightens, the per-category link can slip to PR 4; the Manage link + master unsubscribe are non-negotiable for PR 2.)*

---

## Part C — Trigger condition queries

> ✅ = ships in PR 2 (default-ON, no inferred content). 🔒 = **deferred to PR 3** (opt-in, references inferred/extracted content → must pass the safety filter first).

Let `tz = COALESCE(prefs.timezone, user.timezone, 'America/Chicago')`, `todayStartUtc = start of local day in UTC`.

**✅ streak_preservation** — at-risk streak, evening only:
```
user.currentStreak >= 3
AND NOT EXISTS (Entry where userId=u AND createdAt >= todayStartUtc)   -- not recorded today
AND localHour(now) BETWEEN 18 AND 20                                    -- evening window (pre-quiet-hours)
```
(Prisma: `currentStreak` from the row; `recordedToday` via `entry.count`.)

**✅ habit_reminder** — contentless, at preferred hour, fallback priority:
```
NOT EXISTS (Entry today)
AND localHour(now) == preferredHourLocal (modal-30d or fallback 19:00)
```

**✅ milestone_celebration** — fresh win, event-fresh (polled hourly):
```
EXISTS UserAchievement where userId=u AND earnedAt >= now-24h
       AND id NOT IN (NotificationLog where category='milestone_celebration' refId=achievementId)
-- OR a streak milestone just crossed: currentStreak IN (7,30,100) AND lastStreakMilestone advanced today
```
Scope to **high-value** unlocks (tier ≥ 3 or streak milestones) to avoid over-emailing minor badges — tuning flag.

**🔒 goal_nudge** (PR 3):
```
Goal where userId=u AND status IN ('NOT_STARTED','IN_PROGRESS')
  AND (lastMentionedAt IS NULL OR lastMentionedAt < now-7d)
ORDER BY lastMentionedAt ASC NULLS FIRST LIMIT 1
```

**🔒 task_reminder** (PR 3):
```
Task where userId=u AND status='OPEN'
  AND (snoozedUntil IS NULL OR snoozedUntil < now)
  AND entryId IS NOT NULL
  AND entry.createdAt < now-3d
ORDER BY entry.createdAt ASC LIMIT 1
```

**🔒 theme_followup** (PR 3 + safety filter):
```
Theme t where userId=u
  AND EXISTS (ThemeMention where themeId=t.id AND createdAt >= now-14d AND sentiment <> 'NEGATIVE')
  AND NOT EXISTS (ThemeMention where themeId=t.id AND createdAt >= now-5d)
  AND t.name NOT IN (sensitive denylist)
```

**🔒 life_area_check** (PR 3 + safety filter):
```
LifeMapArea a where userId=u
  AND a.score100 < (history score 14d ago) * 0.85           -- >15% drop
  AND a.area NOT IN (sensitive denylist)
```
*(history via `LifeMapAreaHistory` where `area=a.area AND weekStart` ≈ 14d ago.)*

---

## Part D — Scope decision (the important one, Q5)

**PR 2 ships ONLY the three default-ON categories: `streak_preservation`, `habit_reminder`, `milestone_celebration`.** The four opt-in categories (`goal_nudge`, `task_reminder`, `theme_followup`, `life_area_check`) stay **dark until PR 3**, because every one of them references content Acuity **inferred or extracted from the user's speech**, and per the master spec that content must route through the 3-layer safety filter (PR 3) before it can leave the building. Shipping static templates for them now would put inferred-content notifications in users' inboxes with **no safety filter** — exactly the "delete the app" risk the whole project is designed to avoid.

The PR-2 trio reference **only usage facts** (a streak number, a milestone name, a generic "haven't heard from you" nudge) — zero inferred content — so they're safe to ship on static templates without the filter. This gives us a **shippable, low-risk send pipeline end-to-end** (cron → gates → template → Resend → log → open/click), proves the whole machine in production, and lets PR 3 light up the opt-in categories by adding generation + filtering behind the *same* pipeline.

The eval pipeline, priority ordering, queries, and `NotificationLog` are all built category-agnostic in PR 2, so PR 3 is purely additive (no rework).

---

## Part E — Open questions, answered

1. **Cron frequency?** → **Hourly** (`0 * * * *`). 30-min buys nothing given the 18h floor + ≤1/day caps; hourly already hits each user's preferred local hour and matches existing crons.
2. **Batch size / pagination?** → Fetch the candidate set (already narrowed by SQL: emailEnabled, not paused, due-hour), then process in **`step.run` batches of 25** (mirrors the trial orchestrator's 20). The eligible-per-tick set is small (only users whose target hour == this hour and who pass cheap gates), so one tick handles it comfortably within 300s.
3. **Multiple categories fire → who wins?** → Priority in B3 (`milestone → streak → habit` for PR 2). One send per user per tick, hard-capped by the per-day unique index.
4. **How many static variants per category?** → **5 per category**, rotated by `hash(userId+localDay) % 5`, each with a `caring` and `direct` phrasing. Enough to avoid "same email every time" without a big authoring burden; expands trivially later.
5. **Ship opt-in categories now or wait for PR 3?** → **Wait.** PR 2 = default-ON trio only (Part D). No inferred-content notification goes out without PR 3's safety filter.
6. **Open/click tracking wiring?** → Extend the existing Resend webhook to also match `NotificationLog.resendId` (additive). No new provider work.

---

## Part F — New/changed surface (for the implementation PR)

**Schema (additive):**
- New `NotificationLog` model (B5) — **needs `prisma db push`** + an **RLS entry** (`NotificationLog rls` in `prisma/rls-allowlist.txt`) + the deny-all migration (same pattern as `2026-06-23_user_notification_preferences_rls.sql`). ⚠️ manual step, mirror PR #15.
- Add `preferredHourLocal Int?` to `UserNotificationPreferences` (smart-timing cache) — also a `db push`.

**Code (new):**
- `apps/web/src/inngest/functions/smart-notifications-cron.ts` (+ register in `app/api/inngest/route.ts`).
- `apps/web/src/lib/notifications/` — `eligibility.ts` (the pipeline + gates), `triggers.ts` (the 3 PR-2 queries), `send-notification-email.ts`, `templates/` (3 categories × 5 variants × 2 tones).
- `@acuity/shared`: `isCategoryEnabled(prefs, category)` + the PR-2 shipping-set constant.
- `lib/email-tokens.ts`: new unsubscribe kind `"engagement_notifications"`; unsubscribe route handles it (sets `emailEnabled=false`) + a per-category opt-out token.
- Extend `app/api/webhooks/resend/route.ts` to update `NotificationLog`.
- Prefs UI (web + mobile): send device IANA tz to the prefs `PUT` (A3 gap fix).

**Manual steps (mirror PR #15):** `prisma db push` (NotificationLog + preferredHourLocal); apply the `NotificationLog` RLS migration to prod; add `NotificationLog rls` to the allowlist.

---

## Part G — Risks / dependencies / flags

- **⚠️ Timezone capture gap (A3):** until a user opens settings (writing `prefs.timezone`), non-US users fall back to `America/Chicago` → wrong quiet-hours/timing. The PR-2 device-tz capture fixes it on next settings visit; everyone else is best-effort. Acceptable for an email engine; flag for monitoring.
- **Coexistence with legacy reminders:** `notifications-twice-daily.ts` (push) and `UserReminder` (on-device) are separate systems. PR 2 is email + server-driven, so no channel collision, but be aware of total-volume perception. No change to the legacy systems here.
- **`milestone_celebration` vs in-app celebration:** achievements already surface in-app (`shownToUser`). Emailing every unlock risks redundancy → scope to high-value unlocks (Part C) and dedup via `NotificationLog.refId`.
- **Smart-timing perf:** don't run the modal-hour `$queryRaw` for every user every hour — cache via `preferredHourLocal`, recomputed ≤ daily.
- **PR 3 is a hard gate for opt-in categories** — `theme_followup` / `life_area_check` reference inferred content and must not ship before the safety filter exists. The denylist in the Part C queries is a *coarse* pre-filter, **not** a substitute for PR 3.
- **No new env vars** (Resend/Inngest already configured).

---

## Complexity: **M–L**
Cron + eligibility pipeline + 3 trigger queries + `NotificationLog` (+ RLS) + `preferredHourLocal` + send wrapper + 3×5×2 templates + unsubscribe plumbing + webhook extension. Contained because **no AI, no safety filter, no push** — those are PR 3 / PR 5. Bigger than PR 1; smaller than PR 3.

## Recommended PR-2 commit slices
1. `NotificationLog` + `preferredHourLocal` schema + RLS (db push + allowlist + migration).
2. `@acuity/shared` helpers + eligibility/gates pipeline (pure functions, unit-testable).
3. The 3 trigger queries + candidate scoring.
4. Send wrapper + templates (3×5×2) + `trialLayout` reuse.
5. The Inngest cron wiring it together + register in serve route.
6. Unsubscribe kind + per-category opt-out route + Resend webhook extension + device-tz capture.

**No code until Jim signs off on this spec.**
