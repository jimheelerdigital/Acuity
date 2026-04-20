# Acuity iOS Launch Checklist

**Target:** Get the Expo app onto Jim's personal iPhone via TestFlight, then submit to App Store review.
**Current state (2026-04-20):** All code for a TestFlight-eligible build is shipped. The remaining work is manual (Apple Developer portal, Google Cloud Console, App Store Connect, EAS build command invocations).
**Prerequisite:** Active Apple Developer account (Jim has this).
**Companion docs:** `APPLE_IAP_DECISION.md` (subscription handoff rationale), `AUDIT.md` (general codebase state).

---

## Part A — Manual steps (Jim does these before the first build)

### A.1 Google OAuth — iOS client

- [ ] Open Google Cloud Console → APIs & Services → Credentials → **the Acuity project** (the one that already hosts `GOOGLE_CLIENT_ID` for the web app).
- [ ] Click **Create Credentials → OAuth client ID**.
- [ ] Application type: **iOS**.
- [ ] Bundle ID: `com.heelerdigital.acuity` (exact match required).
- [ ] App Store ID: leave blank for now; populate after App Store Connect record is created (step A.3).
- [ ] Name: `Acuity iOS`.
- [ ] Click Create. Copy the **Client ID** value (looks like `12345-abcdef.apps.googleusercontent.com`).
- [ ] Paste into two places:
  - `apps/mobile/app.json` under `expo.extra.googleIosClientId`.
  - Vercel → Acuity project → Environment Variables → add `GOOGLE_IOS_CLIENT_ID` (Production). Same value.
- [ ] Redeploy the web app after adding the env var (`./scripts/deploy-main.sh` or Vercel redeploy) so `/api/auth/mobile-callback` accepts tokens signed against the new client.

### A.2 Apple Developer — register the bundle ID

- [ ] Open [developer.apple.com/account](https://developer.apple.com/account) → Certificates, IDs & Profiles → Identifiers.
- [ ] Click **+**, register a new App ID:
  - Description: `Acuity`
  - Bundle ID: `com.heelerdigital.acuity` (Explicit, not wildcard)
  - Capabilities: at minimum check **Push Notifications** (for future use) and **Sign In with Apple** (if you want to offer it later — not needed for v1, leave off).

### A.3 App Store Connect — create the app record

- [ ] Open [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → **+ → New App**.
- [ ] Platform: iOS.
- [ ] Name: `Acuity` (must match the Expo app's `name` in app.json).
- [ ] Primary language: English (US).
- [ ] Bundle ID: select `com.heelerdigital.acuity` from the dropdown (it appears only if A.2 is done).
- [ ] SKU: `acuity-ios-v1` (any unique string, not shown to users).
- [ ] User Access: leave default (Full Access).
- [ ] Save.
- [ ] On the app record page, copy the **Apple ID** (numeric, e.g. `6501234567`). Paste it into `apps/mobile/eas.json` under `submit.production.ios.ascAppId`.

### A.4 App icon + splash — design pass

- [ ] `apps/mobile/assets/icon.png` — currently a placeholder: 1024×1024 violet background, white "A". Replace with final branded icon before App Store submission. Keep the same path + 1024×1024 spec.
- [ ] `apps/mobile/assets/splash.png` — currently 1242×2436 violet diamond on dark. Replace with final launch screen. Expo handles scaling to other device sizes from this one asset.
- [ ] `apps/mobile/assets/adaptive-icon.png` — Android adaptive icon, 1024×1024. Also a placeholder.
- [ ] Rebuild + resubmit if the icons change post-TestFlight.

### A.5 App Store screenshots

Apple requires at minimum three screenshot sizes (6.7", 6.5", and 5.5" iPhone). EAS doesn't help with screenshot generation — they need to be captured from a real device or simulator.

- [ ] Install a preview build (see Part B) on the iOS Simulator at 6.7" (iPhone 15 Pro Max).
- [ ] Screenshot five key screens: sign-in, dashboard with entries, record screen mid-session, entry detail, profile.
- [ ] Repeat for 5.5" iPhone (iPhone 8 Plus simulator).
- [ ] Upload in App Store Connect → App Information → Screenshots.

### A.6 App Store metadata

Paste these into App Store Connect → App Information:

| Field                 | Value                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Name                  | `Acuity`                                                                                                                                                                                                                                                                                                                 |
| Subtitle              | `Voice journaling, pattern recognition`                                                                                                                                                                                                                                                                                  |
| Primary category      | Health & Fitness                                                                                                                                                                                                                                                                                                         |
| Secondary category    | Lifestyle                                                                                                                                                                                                                                                                                                                |
| Keywords (comma list) | `journaling,voice memos,mental health,self-improvement,productivity,mood tracking,therapy,wellness,habit,meditation`                                                                                                                                                                                                     |
| Description (draft)   | Acuity turns your nightly voice brain dump into tasks, mood tracking, and pattern recognition across your own words. Talk for sixty seconds. We extract the signal — what you're working on, what's blocking you, how you're doing. Weekly reports, a Life Matrix across six areas, and a Day 14 Life Audit from your own entries. |
| Support URL           | `https://www.getacuity.io/support`                                                                                                                                                                                                                                                                                       |
| Marketing URL         | `https://www.getacuity.io`                                                                                                                                                                                                                                                                                               |
| Privacy Policy URL    | `https://www.getacuity.io/privacy`                                                                                                                                                                                                                                                                                       |
| Age rating            | 17+ (user-generated content, not-for-therapy disclaimer)                                                                                                                                                                                                                                                                 |
| Contains ads          | No                                                                                                                                                                                                                                                                                                                       |

### A.7 App Privacy (data-use disclosures)

App Store Connect → App Privacy. Disclose the following:

- **Audio Data** → Collected: Yes. Linked to user identity: Yes. Used for: App Functionality.
- **Email Address** → Collected (sign-in). Linked to user: Yes. Used for: Account Creation, App Functionality.
- **Name** → Collected (from Google profile). Linked to user: Yes. Used for: Personalization.
- **Usage Data** → Collected (PostHog, with hashed identifiers). Linked to user: Yes. Used for: Analytics.
- **User Content (text/transcripts)** → Collected. Linked to user: Yes. Used for: App Functionality.
- **No advertising identifiers, no third-party trackers, no location data.**

### A.8 Export Compliance

Already declared in `apps/mobile/app.json`:
- `ios.config.usesNonExemptEncryption: false`
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`

Means App Store Connect will not prompt the export-compliance questionnaire on each submission. We use HTTPS + standard iOS crypto only — no custom encryption.

---

## Part B — EAS build + TestFlight flow (Jim runs these)

### B.1 One-time EAS setup

```bash
# From repo root or apps/mobile
npm install -g eas-cli           # if not already installed
cd apps/mobile
eas login                         # first time, Apple ID
eas init --id 0e49fcba-f9f9-4c8a-b3e9-33f271fc0f8c
# ^ projectId is already in app.json; `eas init` links local clone
#   to Jim's existing EAS project. Answer "y" when it asks to update
#   app.json (no-op since we have the ID already).
```

### B.2 Build for TestFlight

```bash
cd apps/mobile
eas build --platform ios --profile preview
```

- First build will prompt: Apple Developer login, push-notification cert, provisioning profile. EAS handles all of these automatically — just say **yes** when prompted to generate.
- Queue wait: ~15-30 min on the free tier, faster on EAS paid.
- When done: EAS gives a build page with an `.ipa` link + a "Submit to TestFlight" button.

### B.3 Submit to TestFlight

```bash
eas submit --platform ios --latest
```

- Uses the credentials you provided in `eas submit` the first time.
- Takes ~5-10 min to upload + ~15-60 min for Apple's automatic TestFlight processing.
- In App Store Connect → TestFlight: add yourself + Keenan as internal testers.
- Install TestFlight on your phone; accept the invite email; download and test.

### B.4 Sanity checks on first install

Run through every path before inviting external testers:

- [ ] App launches; splash screen shows
- [ ] Sign in with Google works (OS-level auth dialog, returns to app)
- [ ] Dashboard loads with greeting + empty state
- [ ] Microphone permission prompt appears on first record tap; granting works
- [ ] Recording runs with live level bars
- [ ] Stop → upload → processing stepper → nav to entry detail
- [ ] Entry detail shows transcript + extracted tasks/themes/wins
- [ ] Profile → "Manage plan on web" opens Safari at /upgrade?src=mobile_profile
- [ ] Close the app, kill it, reopen — still signed in (SecureStore token persists)
- [ ] Sign out → land on sign-in screen → sign in again → work resumes
- [ ] Trial banner visible on dashboard (seed a test user with `--days-into-trial 9` to trigger the 5-day-left branch)

### B.5 Iterate + resubmit

If anything breaks in B.4: fix it in code, commit, push.

```bash
# Rebuild. EAS auto-increments the buildNumber (autoIncrement: true in
# the production profile; preview relies on appVersionSource: "remote").
cd apps/mobile
eas build --platform ios --profile preview
```

Testers get a notification when the new build processes.

---

## Part C — TestFlight internal + external testing

### C.1 Internal (team-only, no Apple review)

- [ ] Invite Keenan via email in App Store Connect → TestFlight → Internal Testing → Testers. He needs to accept via TestFlight on his phone.
- [ ] Invite 2-3 trusted friends the same way.
- [ ] 24-48 hour test cycle. Collect feedback via direct message, email, or a shared Notion page.

### C.2 External (up to 10,000 testers, requires Apple review)

Skip for v1. Jump straight to App Store submission once internal testing is clean.

### C.3 Known hazards to pre-flight

- **First Google sign-in loops back to the sign-in screen:** `GOOGLE_IOS_CLIENT_ID` probably isn't set in Vercel prod. Re-check Part A.1.
- **"Continue on web" from paywall opens to login, not upgrade:** the web session isn't pre-authenticated in the native Safari handoff. Acceptable; user signs in once and returns to upgrade flow. Not a blocker.
- **Recording uploads but entry never completes:** `ENABLE_INNGEST_PIPELINE` is off on the server; POST to /api/inngest returns 503. Flip it on in Vercel env → redeploy. (Or leave the sync path engaged — works fine for low volume.)
- **Icon shows default Expo logo in the build:** the `icon.png` at `apps/mobile/assets/` wasn't picked up. Confirm the path is `./assets/icon.png` in `app.json` and the file is 1024×1024 PNG.

---

## Part D — App Store submission (after TestFlight)

### D.1 Final icon + screenshots

- [ ] Replace placeholder icon + splash with final designs (Part A.4).
- [ ] Capture real screenshots from a TestFlight build (Part A.5). Do NOT use mockups — Apple rejects them.

### D.2 Final description pass

- [ ] Review the A.6 description draft with fresh eyes. Tighten for App Store tone. Keep the "Acuity is not therapy" soft disclaimer out of the description itself — that's in the Terms and the in-app disclosure, not the marketing copy.

### D.3 Submit

```bash
cd apps/mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
```

- [ ] In App Store Connect, move the submitted build from "Prepare for Submission" → "Submit for Review".
- [ ] Answer the review-info questionnaire: demo account, if required (spec §3.1.1 says apps that gate content behind login must provide one) — yes, give them a test-user account you seeded with `npm run test-user:seed`.
- [ ] Export compliance: already declared (Part A.8). Should auto-pass.
- [ ] Expect 24-48h review time for first submission; 1-24h for resubmissions.

### D.4 Respond to reviewer questions

Apple sometimes asks for clarification on:
- Why does the app need the microphone? → "to record the user's voice journal entries, as stated in NSMicrophoneUsageDescription."
- Is there a paid subscription that bypasses IAP? → "Subscriptions are managed on the web (web-first product). The app is a companion; this is allowed under 3.1.3(b) Multiplatform Services."
- Does the app read content that isn't visible to the user? → "No. All data shown is the signed-in user's own entries."

Reply within 24 hours to keep the review cycle short.

---

## Phase 2 — After v1 ships

Deferred during the first push to TestFlight, tracked here so they don't get lost:

- [ ] **Native Day 14 Life Audit view.** Today the Life Audit renders on the web — mobile users tap a link. Native rendering would let them read it inline. Requires a new `/audit/[id]` Expo route + plumbing for the `lifeAudit/completed` event to deep-link.
- [ ] **Push notifications.** For nightly reminders + Life Audit ready. Requires adding `expo-notifications`, a server endpoint to store device tokens, and a scheduled job for reminder time. Non-trivial; defer to Phase 2.
- [ ] **Sign in with Apple.** Apple has been tightening the "offer Apple Sign-In if you offer any other OAuth" rule. Low-lift to add, but not currently required (Google-only ships fine).
- [ ] **Android build.** `app.json` already has the Android package config. EAS preview profile isn't dual-platform — run `eas build --platform android --profile preview` when ready. Will require a Google Play Console account ($25 one-time).
- [ ] **In-app subscription (Option A from APPLE_IAP_DECISION.md).** If `mobile_profile` becomes >15% of upgrade attribution or >20% cross-device drop-off, move to RevenueCat + IAP.
