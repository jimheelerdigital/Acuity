# App Store Review Notes — Acuity

**Target app:** iOS (`com.heelerdigital.acuity`, ASC App ID `6762633410`)
**Drafted:** 2026-04-24 for Build 19 / version 0.1.7
**Status:** Reviewer-facing text and demo-account seed runbook. Not submitted.

This document has three things App Store Review needs:
1. Review notes (the text Jim pastes into the ASC reviewer-notes box).
2. Demo account credentials (the thing Jim seeds before submit).
3. Contact info (the fields at the bottom of the ASC review screen).

Plus the screenshot brief (§4) and the 3.1.3(b) Multiplatform Services defense (§5) in case Apple pushes back.

---

## 1. Review notes (paste into App Store Connect → App Review Information → Notes)

```
Acuity is a nightly voice-journaling companion. The user taps the purple microphone button on the Home tab, talks for up to two minutes about their day, and the app transcribes the recording and extracts structured fields from it — tasks, themes, mood, goals, life-area mentions. Over time the user sees patterns in a Theme Map, a Life Matrix radar chart, and a Sunday-morning weekly report.

The subscription is sold entirely on the web at getacuity.io/upgrade — NOT through Apple IAP. The iOS app is a multiplatform companion client per App Store Review Guideline 3.1.3(b): users sign in with their existing Acuity account, and whatever entitlement their web account carries (TRIAL or PRO) applies on iOS. The app contains no purchase UI, displays no pricing, and makes no reference to cost. The Profile tab's "Continue on web" affordance opens Safari to getacuity.io/account for subscription management — not a WebView, and not a purchase flow.

To test the full product including the post-trial gating UI, please use the demo account below. It has 14 pre-populated entries, an active Pro subscription, and a Life Audit already generated.

Sign-in method: Google OAuth. Tap "Continue with Google" on the sign-in screen.

Key flows to exercise:
1. Home tab → tap the purple microphone → record 30 seconds of speech → review the extraction on the review screen. Tasks and themes appear within ~30 seconds of stopping.
2. Insights tab → tap "Theme Map" → see the extracted themes for the demo user with a hero card, 2x2 grid, and strip rows.
3. Goals tab → tap a goal → see its detail screen with progress controls.
4. Tasks tab → tap a checkbox → it fills purple with a light haptic; tap again to uncheck.
5. Profile tab → "Delete account" (red, at the bottom of the menu) → type the email shown on screen to confirm → "Delete my account". The account is deleted server-side immediately (recordings, transcripts, themes, goals — everything cascades), the Stripe subscription is canceled, and the user is signed out and routed back to the sign-in screen. In-app account deletion per Guideline 5.1.1(v).

If anything is unclear or a flow doesn't work, please email jim@heelerdigital.com — I'll respond within 24 hours.
```

**Char count:** ~1,900 / 4,000 (ASC's notes field accepts up to 4,000). Room to expand if Apple asks follow-ups.

### Why this text, line by line

- First paragraph explains the category in plain language. "Nightly voice-journaling companion" is OK in reviewer-facing text even though "journaling" is banned in marketing copy — reviewers aren't the acquisition audience.
- Second paragraph is the 3.1.3(b) pre-emptive framing. Reviewers search for "IAP" / "subscription" in notes during their rubric pass; putting the multiplatform service framing in front of them before they ask means the review gets scored against the right rubric.
- Third paragraph tells them what to use (demo account) and why (populated data so they can see the hero features).
- Fourth paragraph spells out the primary flow in four steps. Apple reviewers test what you tell them to test. If you don't name Theme Map, they may not open it.
- Fifth paragraph leaves a contact channel.

### What this text deliberately avoids

- Does NOT say "you can't subscribe on iOS." That's confrontational. It says "the subscription is sold entirely on the web" — factual.
- Does NOT reference price, trial length, or post-trial behavior. Price inside the iOS bundle or in review notes is what triggers 3.1.1 flags.
- Does NOT reference "free tier" vs "paid tier" inside the app. The app is a companion; the reviewer sees a demo account with an active subscription and everything works.

---

## 2. Demo account — provisioning runbook

### 2.1 Recommended credentials

- **Email:** `reviewer-b19@test.getacuity.io`
  - `@test.getacuity.io` subdomain matches the allowlist in `scripts/seed-test-user.ts:46` and passes the safety gate.
  - `-b19` suffix tags which build number the account was seeded for — easier to rotate if Apple requires re-review on a later build.
- **Google OAuth:** Apple needs this to actually sign in. Options:
  - **Option A (recommended):** create a throwaway Gmail account `acuity.reviewer.b19@gmail.com`, set its Google profile name to "Apple Reviewer", and seed an Acuity account matching that email. Paste the Gmail password into the "Credentials for sign-in" field in ASC. Reviewer taps "Continue with Google" → picks that Gmail account → lands in Acuity as reviewer.
  - **Option B:** use `jim@heelerdigital.com` or another real account you trust Apple with. Faster to set up; Apple's review access to the Google account is a privacy consideration.
  - Recommend **A** for a clean separation. Creating the Gmail is a 5-min Jim task.

### 2.2 Seed command (run from repo root)

```bash
set -a && source apps/web/.env.local && set +a && \
  npx tsx scripts/seed-test-user.ts \
    --email acuity.reviewer.b19@gmail.com \
    --name "Apple Reviewer" \
    --days-into-trial 7 \
    --subscription-status PRO \
    --with-onboarding-complete \
    --with-entries 14 \
    --force
```

**What this produces** (verified from reading `scripts/seed-test-user.ts`):
- User row with `email: acuity.reviewer.b19@gmail.com`, `name: "Apple Reviewer"`, `subscriptionStatus: PRO`, `trialEndsAt` set to 7 days from now (even though PRO, the field populates so "day X of trial" UI renders sensibly).
- UserOnboarding row with `completedAt = now` so the reviewer doesn't land in the onboarding flow.
- 14 sample Entry rows with dummy transcripts, one per day spread over the last 14 days at 21:00 user-time, status=COMPLETE. Extraction runs to produce themes, tasks, life-area mentions, mood scores.

**Important:** the email must match `@test.getacuity.io` OR `@example.com` OR `plus-addressed @getacuity.io` per the safety gate at `scripts/seed-test-user.ts:46-50`. `@gmail.com` doesn't match. Two approaches:

1. **Preferred:** extend the allowlist to include `acuity.reviewer*@gmail.com` as a one-shot pattern. Edit `scripts/seed-test-user.ts:46-50`, add:
   ```typescript
   /^acuity\.reviewer.*@gmail\.com$/i,
   ```
   Commit + run the seed. Revert the allowlist edit after submit — or leave it if the pattern reads safely.
2. **Alternative:** seed under `reviewer-b19@test.getacuity.io`, but Apple needs Google OAuth. That requires the Gmail account match the email on file. Can't use this path.

The preferred approach is A with the allowlist extension.

### 2.3 After seeding — verify on device

Before submit, sign into the seeded account via the current Build 19 install (download from TestFlight after Apple finishes processing):
1. Sign-in works (Google OAuth completes without error).
2. Home tab loads with the 14 entries visible in "Recent sessions."
3. Insights tab shows Theme Map unlocked (since the account has 10+ entries).
4. Profile → subscription status reads "Active" (not "Trial" — the account is PRO).

If any step fails, re-seed with `--force` and re-verify before submitting the build for review.

### 2.4 Reviewer credentials box in ASC

Once the seed + Gmail account are prepared, paste into App Store Connect → App Review Information:

| Field | Value |
|---|---|
| Demo account required | **Yes** |
| Username | `acuity.reviewer.b19@gmail.com` |
| Password | **The Gmail password Jim created.** |
| Sign-in notes | "Tap 'Continue with Google' on the sign-in screen. Select the Apple Reviewer account from Google's account picker. You'll land in the Home tab with 14 pre-populated entries." |

---

## 3. Contact information

| Field | Value | Status |
|---|---|---|
| First name | Jim | — |
| Last name | Cunningham | — |
| Phone number | **TO FILL** | Jim adds personal or business line before submit |
| Email | `jim@heelerdigital.com` | — |

Apple rarely phones, but the number is required. A business line is preferable to personal; if Jim doesn't have one, Google Voice is free.

---

## 4. Screenshot brief (manual capture on device)

Apple requires 3–10 screenshots per device size. Minimum: **iPhone 6.9"** (iPhone 16 Pro Max, iPhone 16 Plus, iPhone 15 Pro Max). Adding **iPhone 6.5"** (iPhone 11 Pro Max / XS Max) expands compatibility to older devices.

**Do not generate programmatically.** Detox is not set up in this repo, and attempting a sim-based screenshot pipeline would consume more time than Jim capturing them by hand on a physical device. Manual capture produces better-looking results because the real device renders system UI correctly.

### 4.1 Six recommended shots (in order)

Each shot: tap-through to the screen on the reviewer-seeded build (Build 19), Cmd+Shift+3 equivalent on iOS (Volume Up + Side Button) to capture. Transfer via AirDrop to a Mac, then add caption overlay in Figma / Sketch / Canva.

| # | Screen | Where to reach | Caption option A | Caption option B |
|---|---|---|---|---|
| 1 | Home tab with focus card + purple record button | Open app → lands here | **Talk for sixty seconds.** That's the whole thing. | **Your nightly brain dump,** listened to. |
| 2 | Record screen mid-recording | Home → tap purple mic → 3-5 seconds in | **Just talk.** No prompts. No typing. | **Say it out loud.** Go to sleep. |
| 3 | Extraction review (tasks + themes pulled from a transcript) | Record → stop → wait ~30s for extraction | **Your tasks, pulled from your own words.** | **"Call the accountant" becomes a task.** |
| 4 | Theme Map — hero card visible | Insights → Theme Map | **The patterns you didn't clock.** | **Career. Sleep. Your partner.** Every week. |
| 5 | Insights tab with Life Matrix radar visible | Insights → scroll to Life Matrix | **What's lit up. What's been quiet.** | **Six areas of your life,** scored by you. |
| 6 | Entries list with recent entries | Entries tab | **A record of what you said, when you said it.** | **Every entry, searchable.** |

### 4.2 Capture specs

- **Device:** iPhone 16 Pro Max (or any 6.9" device) for primary. iPhone 15 Pro or 14 Pro (6.1") acceptable as secondary.
- **Mode:** dark mode (Acuity's primary design. User's system theme is `dark` per `apps/mobile/app.json:9`).
- **Status bar:** Apple requires "clean" status bar. Install `Status Magic` (free) on the device or use Simulator's `xcrun simctl status_bar override` to set a clean 9:41 AM / full battery / full signal status bar before capture.
- **Resolution:** capture at native resolution. Figma / Canva handles the export to Apple's accepted sizes (1290×2796 for 6.9", 1284×2778 for 6.5").
- **Caption overlay:** bottom third of the image, soft dark gradient fade, white typography. Use the existing Acuity brand font stack (Inter-Semibold 72pt headline, Inter-Regular 28pt subtext if needed).
- **Do not show pricing anywhere in any screenshot.** Same defensive move as §7 of `APP_STORE_PRICING.md`.

### 4.3 Caption voice-rubric pass

Every caption above is < 50 chars, uses approved terms ("brain dump", "sixty seconds"), avoids banned verbs/nouns/adjectives per `Acuity_SalesCopy.md §3`, and contains zero tricolons or "AI-powered" language. Shot 4's "The patterns you didn't clock" is a verbatim pull from the landing page (`apps/web/src/components/landing.tsx`) — consistent voice between the App Store and the marketing site earns trust.

### 4.4 Optional: App Preview video (10-30 seconds)

Apple allows one App Preview video per size. Good to have, not required for v1.

Recommended shape if Jim wants to capture one:
- 00:00 — Home tab with focus card visible
- 00:02 — Tap the purple mic → record screen appears
- 00:04 — 3 seconds of level-bar animation
- 00:07 — Tap stop → "Processing your recording" spinner
- 00:10 — Extraction review screen — tasks + themes fade in
- 00:14 — Tap commit → back to Home
- 00:17 — Swipe to Theme Map
- 00:22 — Swipe to Insights / Life Matrix
- 00:27 — End on "Sixty seconds. Every night." text overlay

Capture with QuickTime screen recording of the mirrored device OR a real screen recording from the device. Export 30fps.

---

## 5. Defense framing if Apple rejects under 3.1.1 (IAP requirement)

**The scenario:** the reviewer flags the app under Guideline 3.1.1 "In-App Purchase" — "apps offering subscriptions that unlock features must use Apple's IAP."

**The response (paste verbatim into the ASC reply box):**

```
Acuity is a multiplatform service. Subscriptions are sold through our web application at getacuity.io, which predates the iOS app by approximately 18 months. Per App Store Review Guideline 3.1.3(b) (Multiplatform Services), users with existing subscriptions can access their content and features on iOS without the subscription being purchased through Apple's IAP.

The iOS app contains no purchase UI: no pricing information appears anywhere in the app, there is no "Buy," "Subscribe," or "Upgrade Now" button, and the app makes no reference to cost or cross-platform discounts. Users who sign in with an account that has an active web subscription receive the paid features on iOS; users without a subscription see the same feature limits as on the web.

The Profile tab includes a "Continue on web" affordance that opens Safari (not an in-app WebView or purchase flow) to getacuity.io/account for subscription management — the same account-management surface that has always served our web customers. Per 3.1.3(b), this is factual non-steering language about where account management happens, not purchase-steering communication.

If there is additional information we can provide to resolve this review, please let us know.
```

**Backup plan if Apple escalates:** implement RevenueCat + native IAP per Option A in `docs/APPLE_IAP_DECISION.md` §2. Estimated 5-7 engineering days. Adds Apple's 15% cut (under Small Business Program). Not catastrophic, but it's the work we'd prefer to defer until mobile attribution data justifies it.

---

## 6. What to do between submit and decision

Apple's review SLA is typically 24-48 hours for a first submission, occasionally up to a week. While review is pending:

- **Monitor ASC inbox + `jim@heelerdigital.com`.** Apple's review emails go to the contact email. Respond within 24 hours.
- **Don't touch the App Store Connect listing.** Editing metadata during review can reset the queue or trigger re-review.
- **Do test on TestFlight with a real user.** Build 19 is live on TestFlight; signing in with a non-reviewer account and exercising real flows surfaces last-mile bugs the reviewer might hit.
- **Have the 3.1.3(b) response in §5 ready to paste.** If Apple rejects on IAP grounds, replying within 4 hours keeps the queue warm.

---

## 7. Submit checklist

- [ ] Gmail account created for `acuity.reviewer.b19@gmail.com` (or equivalent).
- [ ] Allowlist in `scripts/seed-test-user.ts` extended to match the Gmail pattern (or revert to a `@test.getacuity.io` email).
- [ ] Seed command run successfully; `userId` echoed in terminal.
- [ ] Build 19 installed on a test device; sign-in into the demo account works; 14 entries visible; Theme Map unlocked; subscription shows Active.
- [ ] Review notes text (§1) pasted into ASC.
- [ ] Demo credentials (§2.4) pasted into ASC.
- [ ] Contact info (§3) completed, phone filled.
- [ ] 6 screenshots captured per §4, uploaded to ASC for iPhone 6.9" at minimum.
- [ ] Pre-submit grep from `APP_STORE_PRICING.md §7` returns zero matches.
- [ ] Submit for review.
