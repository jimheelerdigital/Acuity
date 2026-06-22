# Smart notifications engagement engine — Phase 1 spec

**Date:** 2026-06-22 · **Status:** Plan (no code) · **Owner:** Jimmy
**Goal:** Drive users back via personalized notifications referencing their *actual* content (goals, tasks, themes, life areas) — engagement lift, not the "delete app" reaction. Strategic configurability is the safety valve.

---

## Audit — what exists vs. what's net-new

### 1. Push infrastructure — EXISTS but DORMANT ⚠️
- `lib/trial-countdown-push.ts` sends via the **Expo Push API** (`https://exp.host/--/api/v2/push/send`, direct fetch — no expo-server-sdk). Token in **`User.pushToken`** (+ `pushTokenPlatform` "ios"/"android", `pushTokenUpdatedAt`).
- `inngest/functions/trial-countdown-push-cron.ts` is the **reusable cron pattern** (hourly, cohort windows, idempotent via `*SentAt`-IS-NULL updateMany).
- **🔴 BLOCKER:** it's a **no-op today** — no user has a `pushToken` because **mobile Expo push-token registration is paused** (touches live app launch + auth + a new API contract → HIGH RISK per the live-app constraint, awaiting Jim's go/no-go). **Smart push cannot deliver until that mobile work ships.** Until then, smart notifications are **email-only**.

### 2. Email fallback — EXISTS, fully reusable ✅
- `lib/trial-countdown-emails.ts` (mid-trial T-4 / urgency T-2 / ended T-0 / re-engage T+3) + `trial-countdown-emails-cron.ts` + Resend + `trialLayout`/`trialButton` helpers. Idempotent `*EmailSentAt` columns. Unsubscribe via `User.onboardingUnsubscribed` + signed token. **Same patterns reuse directly** for engagement emails.

### 3. User data for personalization
| Signal | Source | Reliability |
|---|---|---|
| **Active goals** + progress + `lastMentionedAt` | `Goal` (status, progress, title) | ✅ reliable, easy |
| **Open tasks** + dueDate + linked goal | `Task` (status, title, dueDate, goalId) | ✅ reliable, easy |
| **Recent themes** + sentiment | `Theme` + `ThemeMention` (sentiment POSITIVE/NEUTRAL/NEGATIVE, denormalized `createdAt`) | ✅ reliable, easy — time-windowable |
| **Declining/low life areas** | `LifeMapArea` (score100, trend, weeklyDelta, monthlyDelta) + `LifeMapAreaHistory` | ✅ reliable, easy |
| **Recent entry content** | `Entry.transcript` / `summary` / `rawAnalysis` / `themes[]` | ⚠️ raw text — use only via the safety filter; never quote verbatim |
| **Generated insights** (esp. CONCERNING) | `UserInsight` (observationText, severity, linkedAreaId) | ✅ reliable — *but CONCERNING ones must be excluded from nudges* |
| **Streak / activity** | `User.currentStreak`, `totalRecordings`, **`lastSeenAt`** ✅ | ✅ reliable |
| **Typical engagement time** | derive from `Entry.entryDate`/`createdAt` distribution (last 30d) | ⚠️ derivable, needs a query (no stored field) |
| **People mentioned** | `Person` + `EntityMention` | ⚠️ exists but **high creepiness risk** — see open Q5 |
| "Recorded today" / "last notified" gate | `Entry` query today / **`lastNotifiedAt` (NEW)** | ⚠️ needs a new field for the 18h cap |

### 4. AI content generation — EXISTS ✅
- `lib/content-factory/claude-client.ts` → `callClaude(...)`; logs to `ClaudeCallLog`; `CLAUDE_MODEL = "claude-sonnet-4-6"`. Reusable for 1-line copy gen.
- ⚠️ I did **not** find a `SYSTEM_RULES` constant by that name — the anti-sycophancy guidance to reuse needs locating/confirming in Phase 2 (it may be inline in existing prompts). Flag, don't assume.

### 5. Existing notification prefs — minimal, NOT smart-notification prefs
- `User.notificationTime` ("21:00"), `notificationDays` (Int[]), `notificationsEnabled` (**default false**) → a **local habit reminder** (mobile `expo-notifications`, scheduled on-device), plus a newer **`UserReminder`** model (multiple reminders). `onboardingUnsubscribed` for email.
- **None of this is server-driven smart-notification config.** Categories, frequency caps, quiet hours, per-category opt-outs, pause-until, tone → **all net-new** (`UserNotificationPreferences`).
- **`ConsentRecord`** exists (consentType incl. `marketing`, `special_category_processing`; granted/wording/policy/platform) → reuse for the **GDPR behavioral-notifications opt-in** (new consentType).
- **No sensitive/crisis/private classification exists** — `RedFlag` is operational alerts only; `Entry` has **no `isPrivate`** flag. The content-safety filter (§arch-4) is **entirely net-new** and is the highest-risk piece.

---

## Proposed architecture

### 1. `UserNotificationPreferences` (new table; shared types in `packages/shared`)
Separate table (keeps the User row lean; 1:1 by `userId`):
```
userId (unique FK)
pushEnabled            Boolean  // master
emailEnabled           Boolean  // master (email fallback)
maxPerDay              Int      @default(1)   // Pro cap
maxPerWeek             Int      @default(1)   // free cap; scheduler enforces by subscriptionStatus (free ~1/wk, Pro ~1/day)
quietHoursStart        String   @default("21:00")   // user-local HH:MM
quietHoursEnd          String   @default("09:00")
timezone               String?  // IANA, captured from device/browser
enabledCategories      String[] // ON categories; seeded with the default-ON set; content-referencing ones added only on explicit opt-in
tone                   String   @default("caring")  // "caring" | "direct"
pausedUntil            DateTime?
lastNotifiedAt         DateTime?  // drives the 18h gate
behavioralConsent      Boolean  @default(false)     // true when the user opts into any content-referencing category; logged as a ConsentRecord (behavioral_notifications) for EU
updatedAt
```
Categories use an explicit `enabledCategories` list seeded with the default-ON low-risk set; content-referencing categories require explicit opt-in (global). See Locked Decisions §1.

### 2. Categories (7, independently toggleable)
| Key | Example | Default | Notes |
|---|---|---|---|
| `streak_preservation` | "5-day streak — one entry keeps it going" | **ON** | conservative: ≥3, not recorded today, capped |
| `habit_reminder` | generic time-based, no content | **ON** | lowest risk |
| `milestone_celebration` | achievement unlock | **ON** | celebrates the user's own win |
| `goal_nudge` | "How's your reading goal going?" | **ON** | goals are user-set targets |
| `task_reminder` | "Still planning to call mom this week?" | **ON** | the user's own actionable items — calendar-like |
| `theme_followup` | "You mentioned work stress a few days ago — anything new?" | **opt-in** | references inferred themes — safety filter applies |
| `life_area_check` | "Fitness has been dipping. Anything to talk about?" | **opt-in** | references inferred area scores |

Default-ON = the user's own concrete items (streak/habit/milestone/goal/task), calendar-like. Opt-in (global, not just EU) = the *inferred* categories (theme follow-ups, life-area checks). (Tasks are auto-extracted from entries, not typed — but they're concrete actionable items, so they default ON.)

### 3. Scheduling + frequency
- Hourly Inngest cron (reuse the push-cron pattern). Per eligible user: pick the single highest-value candidate notification, gated by:
  - `pushEnabled`/`emailEnabled`, category not opted out, `pausedUntil` not active.
  - within `maxPerDay`/`maxPerWeek`; **not within 18h of `lastNotifiedAt`**.
  - **not in quiet hours** (default 21:00–09:00 user-local).
  - **skip if the user already recorded today** (Entry query).
  - **smart timing:** prefer the user's typical engagement hour (Entry-timestamp mode over 30d); fall back to a sensible default.
- Candidate scoring: prioritize stale goals, overdue tasks, declining areas, streak-at-risk — one per send.

### 4. Sensitive-content filter — CRITICAL, net-new (layered)
No existing classification, so build a **3-layer gate** that every content-referencing notification must pass *before* send:
1. **Explicit blocklist** (fast, deterministic): theme/keyword denylist — grief, death/illness, addiction, abuse, self-harm/suicidal ideation, divorce/breakup, job loss, finances-distress, etc. Match against the theme name + the candidate snippet. Hard-drop on hit.
2. **Sentiment/severity gate:** never build from a `ThemeMention` with NEGATIVE sentiment on a sensitive area, and **never** reference a `UserInsight` with `severity = "CONCERNING"`.
3. **Claude safety-judgment pass** (final): the generated 1-line copy is sent to `callClaude` with a strict rubric ("Would a reasonable person find this notification intrusive, presumptuous, or insensitive given the topic? Reply BLOCK/ALLOW + reason") — default to BLOCK on uncertainty. Logged to `ClaudeCallLog`.
- **Recency:** only reference content **≤ 30 days** old (stale = creepy).
- **Privacy:** `Entry` has no `isPrivate` flag today → either (a) add one (new), or (b) v1 relies on the filter + never quotes transcripts verbatim (only references themes/areas/goals). **Recommend (b) for v1**, add an explicit per-entry "don't reference this" flag as a fast-follow.

### 5. AI content generation
- `callClaude` (Sonnet 4.6) + `ClaudeCallLog`. Locate/confirm the anti-sycophancy system rules (audit §4) and apply them.
- Copy rules: **< 80 chars**, conversational, **never preachy, never sycophantic**, sentence case, no emoji spam, no fake urgency. Mirror voice per `_design/DESIGN_SYSTEM.md §7` (reflect, don't advise; banned-word list).
- **Tone A/B:** one variable — `caring` vs `direct` — from preferences (Q3).
- **Cache** generated copy per (user, category, content-hash) for ~24h so a user with multiple eligible candidates / cron retries doesn't double-charge Claude.

### 6. User controls UI (Settings → Notifications)
- Master push + email toggles · per-category toggles · quiet-hours picker · **Snooze** (pause-until) · tone selector.
- Each delivered notification carries **"Why did I get this?"** → deep-links to the relevant category in prefs, + inline **"Stop notifications like this"** (one-tap category opt-out).
- Shared categories/labels live in `packages/shared` (iOS + Android + web read the same source).

### 7. Tracking + measurement
- Events: `notification_scheduled` / `notification_sent` / `notification_opened` / `notification_dismissed` / `notification_caused_entry` (entry within 24h of send) — all with `category`, `channel` (push/email), `tone`.
- Per-category **engagement vs. opt-out** rates → the kill-switch signal for bad categories.
- Surface in the **admin MRI dashboard** (PR #10 infra exists).

### 8. Compliance
- **GDPR:** content-referencing categories are **opt-in for everyone** (locked) — which also satisfies EU behavioral-consent. For EU users, record the opt-in as a `ConsentRecord` (`behavioral_notifications`); `behavioralConsent` on prefs is the fast-read mirror. The default-ON categories (habit/streak/milestone/goal) carry no behavioral targeting.
- **First-launch:** notification opt-in prompt fires **after the first record**, never before (matches onboarding strategy).
- **Transparency:** an in-app explainer of exactly what data is referenced (goals/tasks/themes/areas — never private content, never sensitive topics).

---

## Locked decisions (2026-06-22)
1. **Category defaults:** default-**ON** — `streak_preservation`, `habit_reminder`, `milestone_celebration`, `goal_nudge`, `task_reminder` (the user's own concrete/actionable items — calendar-like). **Opt-in, globally** (not just EU) — `theme_followup`, `life_area_check` (inferred content). Cleaner privacy story.
2. **Favorite/leave-alone topics:** v2, not v1.
3. **Tone:** global `caring` (default) / `direct`. No "playful".
4. **Streak:** conservative — streak ≥ 3, no entry today, within the evening window, counts against the cap, one-tap off.
5. **Name people:** NO in v1; likely never (creepiness ceiling too low). The "people nudges" idea is dropped.
6. **Free vs Pro caps:** free ≈ 1/week, Pro ≈ up to 1/day — enforced by `subscriptionStatus` in the scheduler.
7. **Push → EMAIL-ONLY FIRST.** Mid-launch (Android in review, iOS pending) — do **not** touch mobile auth/launch now. v1 is an **email** re-engagement engine (deep-linked emails bring users back). Mobile Expo push-token registration is a separate PR ~2–3 weeks post-launch once stable; the push-send code stays ready but inactive.
8. **Privacy:** no `Entry.isPrivate` in v1. The safety filter operates at the theme/category level; privacy-conscious users disable the (opt-in) content-referencing categories. Add `Entry.isPrivate` only if we ever do transcript-level references (likely never).

---

## Complexity: **L** (email-only v1)
Engine + prefs + safety filter + scheduling + UI + analytics = **L**. The HIGH-RISK mobile push-token registration is deferred to a separate post-launch PR, so v1 stays **L** and email-only.

## Proposed PR breakdown
- **PR 1 — Schema + preferences + UI** *(start here, after sign-off)*: `UserNotificationPreferences` + shared categories/types (`packages/shared`) + Settings → Notifications screen (per-category toggles with the locked defaults, quiet hours, snooze, tone). Independent of push readiness — safe to build now.
- **PR 2 — Scheduling + send infra (email):** eligibility/candidate-scoring cron (reuse the cron pattern) + deep-linked **email** sender (reuse trial-email patterns) + plan-based caps / quiet-hours / recorded-today / 18h gates + `lastNotifiedAt`. Push send stubbed-but-inactive.
- **PR 3 — AI content gen + safety filter:** `callClaude` copy gen + the 3-layer sensitive-content filter + copy rules + tone A/B + caching. **Everything routes through the filter** before send.
- **PR 4 — Analytics + measurement:** the event set + per-category engagement/opt-out + MRI surfacing.
- **PR 5 — (deferred, ~2–3 weeks post-launch, HIGH RISK):** mobile Expo push-token registration → `User.pushToken`, then flip push on (send code already exists).

## Parity
Push = iOS + Android (Expo). Web = **email fallback only** (no web push). Shared preferences + category definitions in `packages/shared` so all three read one source — per parity-by-default.

---

## Sequencing — decided
- **Push:** deferred. v1 is email-only; mobile push-token registration is PR 5, ~2–3 weeks post-launch.
- **Privacy flag:** no `Entry.isPrivate` in v1; safety filter operates at the theme/category level.
- **Start point:** **PR 1** (schema + preferences UI) — independent of push, safe to build now. **Awaiting Jim's sign-off on this tightened spec before any implementation.**
