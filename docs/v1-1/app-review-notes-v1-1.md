# App Store Review Notes — Acuity v1.1

**Target version:** 1.1.0 (App ID `6762633410`, bundle `com.heelerdigital.acuity`)
**Status:** Draft, ready to paste once Apple clears v1.0 and we open the v1.1 review.
**Drafted:** 2026-05-02

This is the v1.1 supplement — it stacks ON TOP of `docs/APP_STORE_REVIEW_NOTES.md` (v1.0 baseline). When submitting v1.1, paste **the full v1.0 notes** AND the addendum below into the ASC Review Notes box. Apple's review record is per-build, so notes from prior builds are not carried forward by ASC.

---

## 1. Reviewer notes addendum (paste below the v1.0 notes)

```
What changed in v1.1
--------------------
v1.1 introduces a redesigned free tier and a placeholder Calendar surface.
Both are deliberate to remain inside the Multiplatform Service rubric
(3.1.3(b)) — none of the new surfaces contain a purchase pathway, an
in-app subscription affordance, or a price reference.

1. Free tier (post-trial behavior)

   The 14-day trial is unchanged. After it ends without an active
   subscription, the account moves to the "free" partition, which
   continues to allow recording but locks the AI debrief surfaces:
   - Home dashboard: shows a locked card explaining "Continue on web"
   - /life-matrix, /goals, /tasks, /insights, /entries/[id]: each
     shows a locked card with the artifact preview and a "Continue
     on web →" affordance
   The "Continue on web" link opens Safari to https://getacuity.io
   in an external browser. It is not a WebView. The iOS app does
   not present any subscription, pricing, "Upgrade", or "Subscribe"
   text. The user cannot complete a transaction inside the app and
   the app does not redirect to a payment screen.

   To exercise the free-tier UX, please sign in with the v1.1 demo
   account (credentials below) — that account is on the free tier
   with realistic past entries to populate the locked-state surfaces.
   Recording continues to work; tap the purple microphone, record a
   short clip, and you will see the entry persist. The locked cards
   surface AFTER you save the recording, on the various dashboard
   tabs.

2. Calendar placeholder

   The /account → Integrations panel (web) and the Profile → Calendar
   item (iOS) now show a "Connect from iOS app — coming soon" card
   for users with an active subscription. There is no OAuth handoff,
   no calendar permission prompt, no purchase pathway, and no price
   reference. Real calendar wiring (EventKit) ships in a follow-up
   release; this version is the visual placeholder so Trial/Pro users
   know it is coming.

3. Other improvements

   Recording reliability for entries longer than 30 seconds. No
   user-visible UI change — the upload retries gracefully on a
   network drop and the processing pipeline runs asynchronously.

Demo account for v1.1 (free tier)
---------------------------------
   Email:    jim+applereview-v11@heelerdigital.com
   Password: m6d&s9DWdVn%fLKU
   Tier:     Free post-trial (trialEndsAt = 7 days ago)
   Content:  8 entries seeded across the prior 30 days

Sign-in: tap "Sign in with email" on the sign-in screen, paste the
above email, paste the password, tap Continue. The reviewer account
exists on the production database and is allowlisted by the seed
script — no special build flag is needed.

(The v1.0 demo account at the top of these notes remains valid for
testing the active-trial / Pro experience.)

Surfaces to verify (3.1.3(b) defense)
-------------------------------------
With the v1.1 demo account signed in, please confirm that:
- The locked cards on /home, /life-matrix, /goals, /tasks, /insights,
  and any /entries/[id] detail page contain the text "Continue on
  web →" and tapping it opens Safari, not a WebView.
- /account → Integrations and Profile → Calendar contain the text
  "Connect from iOS app — coming soon" with no Connect / Authorize /
  Purchase / Upgrade / Subscribe button.
- The recording flow (purple microphone) works for the free-tier
  account — the entry saves, transcribes, and appears on the Recent
  Entries list. The AI debrief expansion is what's locked, not the
  recording itself.
- Profile → Delete account works for the free-tier account exactly
  as it does for the v1.0 Pro account (Guideline 5.1.1(v)).

Contact: jim@heelerdigital.com — 24-hour response.
```

**Total combined char count (v1.0 + addendum):** ~3,400 / 4,000. Room for follow-ups if Apple asks.

---

## 2. 3.1.3(b) compliance checklist (internal — do NOT paste into ASC)

Used as the pre-submission gate. If any of these fail, do not submit.

### 2.1 Locked-state cards

| Surface                            | Copy contains "Continue on web" | No purchase pathway | Verified-by-tester |
|------------------------------------|-------------------------------|--------------------|--------------------|
| /home (FREE locked card)           | YES                            | YES                | TODO              |
| /life-matrix (FREE locked card)    | YES                            | YES                | TODO              |
| /goals (FREE locked card)          | YES                            | YES                | TODO              |
| /tasks (FREE locked card)          | YES                            | YES                | TODO              |
| /insights (FREE locked card)       | YES                            | YES                | TODO              |
| /entries/[id] (FREE locked card)   | YES                            | YES                | TODO              |

### 2.2 Calendar placeholder

| Surface                                       | Copy: "Connect from iOS app — coming soon" | No CTA opens auth flow | Verified-by-tester |
|-----------------------------------------------|---------------------------------------------|-----------------------|--------------------|
| /account/integrations (web)                   | TODO confirm exact string                   | YES                   | TODO               |
| Profile → Calendar (iOS)                      | TODO confirm exact string                   | YES                   | TODO               |

### 2.3 Forbidden surfaces (must NOT appear anywhere)

- "$" symbol
- "/mo" or "/month" string
- "Subscribe" button
- "Upgrade" button (the home FREE card uses "Continue on web →" instead)
- Any in-app price text
- Any in-app purchase confirmation modal
- A WebView pointing at getacuity.io/upgrade or any Stripe Checkout URL

The "Continue on web" affordances all open external Safari via
`Linking.openURL`, NOT a WebView. Verify by tapping each — the URL
bar should appear at the top of Safari with the system tab UI.

### 2.4 Default subscription state for the v1.1 demo account

- `subscriptionStatus = "FREE"` (literally, not "TRIAL" with expired trialEndsAt)
- `trialEndsAt = 7 days ago` (so it is unambiguously post-trial)
- `entitlement.canRecord = true`
- `entitlement.canExtractEntries = false` ← the FREE-vs-PRO partition
- `entitlement.canSyncCalendar = false`

This combination is what produces the FREE locked-state UX without
running into the active-trial countdown, the past-due grace banner,
or the active-Pro full experience. Verify after running the seed
script with the snippet at the bottom of `seed-v11-reviewer.ts`.

---

## 3. Risk register

| # | Risk                                                                 | Mitigation                                                                                              |
|---|----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| 1 | Reviewer reads "Continue on web" and treats it as a sub-flow CTA.    | The notes addendum (§1) clarifies this is external-browser handoff; the demo account is on the free tier so the reviewer experiences the locked surface directly. |
| 2 | Reviewer mistakes the calendar placeholder for a half-shipped feature. | Notes explicitly call it a "placeholder" + "coming in a follow-up release." Visual surface is small and labelled.   |
| 3 | The seed script fails in CI on the day of submission and the reviewer account doesn't exist. | Idempotent seed (allowlisted email, `--force` recreates cleanly). Test from home network the day before submission. |
| 4 | Reviewer hits a /api/record cap (slice 6 soft cap) during testing.   | Cap flag is OFF at v1.1 ship. The reviewer account is FREE post-trial but the cap mechanism is dormant — no risk.  |
| 5 | The free-cap-evaluator cron auto-flips the cap mid-review.           | Cron requires 7 consecutive Sundays of all-conditions-met; only seven Sundays into a launch with low FREE volume the cron cannot trigger yet. Even if it did, the reviewer account would simply hit "30 of 30 — this one is on us" once and the next would 402 with "Continue on web" copy — still 3.1.3(b)-compliant. |

---

## Cross-references

- v1.0 notes: `docs/APP_STORE_REVIEW_NOTES.md`
- Reviewer creds runbook: `docs/v1-1/reviewer-account-v1-1.md`
- Seed script: `apps/web/scripts/seed-v11-reviewer.ts`
- Free-tier spec: `docs/v1-1/free-tier-redesign.md`, `docs/v1-1/free-tier-phase2-plan.md`
- Calendar status: `docs/v1-1/calendar-integration-summary.md`
- IAP framing baseline: `docs/APPLE_IAP_DECISION.md`
