# App Store Readiness — 2026-04-26

**Target:** iOS `com.heelerdigital.acuity` (ASC App ID `6762633410`)  
**Expo SDK:** 54.0.0, React Native ~0.81, EAS with autoIncrement build numbering  
**Review period:** 24-48 hours post-submit (Apple SLA)

---

## BLOCKERS (will be rejected)

- [ ] **NO "Sign in with Apple" — CRITICAL REJECTION RISK.** App offers Google OAuth at sign-in but does not offer Sign in with Apple. Per App Store Review Guideline 4.8, if an app offers any third-party sign-in (Google, Facebook, etc.), it MUST also offer Sign in with Apple as an option. This is a hard reject. **Fix:** Add `expo-apple-authentication` package, implement Apple sign-in flow in `apps/mobile/app/(auth)/sign-in.tsx` alongside Google, add necessary entitlements. Est. 2–3 days.

- [ ] **NO account deletion in mobile app.** The web app has `POST /api/user/delete` (verified in `/apps/web/src/app/api/user/delete/route.ts`), and the support page (`/apps/web/src/app/support/page.tsx`) documents "From the iOS app, tap Profile → Delete account." BUT the mobile Profile tab (`/apps/mobile/app/(tabs)/profile.tsx`) contains NO delete option—only Sign out, Manage plan, Reminders, Apple Health (future), and Theme. This is mandatory per Apple's 2022+ guidelines: apps must allow users to delete their account within the app itself, not just on the web. **Fix:** Add a red destructive MenuItem to profile.tsx that calls `DELETE /api/user/delete` with a confirmation dialog. Est. 4–6 hours.

- [ ] **Stripe-only mobile subscriptions; no StoreKit2 / RevenueCat.** App redirects to web for all subscription flows (`apps/mobile/app/paywall.tsx` → `openUpgrade()` → `/upgrade` in SFSafari). No native in-app purchase or Apple StoreKit configured. Documented decision: Option C in `docs/APPLE_IAP_DECISION.md` (multiplatform service per 3.1.3(b)). HOWEVER: Apple may still reject under 3.1.1 ("apps offering subscriptions must use Apple's IAP"). The review notes have a fallback defense framing (§5), but success is not guaranteed. **This will be a high-tension review point.** If Apple rejects, fallback is RevenueCat + IAP implementation (5–7 days). Ship with the web-only approach now, be ready to pivot post-rejection if needed.

- [ ] **Empty entitlements file.** `/apps/mobile/ios/Acuity/Acuity.entitlements` is present but empty (`<?xml><dict/></dict></xml>`). App uses `expo-notifications` (configured in app.json §62), which requires remote notification entitlements (`aps-environment`). Expo build should auto-populate this, but verify post-build that the IPA includes the correct entitlements. If empty post-build, Apple will flag during processing. **Check:** After EAS build completes, inspect the generated entitlements or re-run the build with verbose logging.

---

## MUST-HAVE BEFORE SUBMIT (not blockers but will delay review or fail edge cases)

- [ ] **Icon has transparency (RGBA).** `/apps/mobile/assets/icon.png` is 1024×1024 PNG with RGBA (alpha channel, i.e., transparency). Apple's guidelines state icons should NOT have transparency or rounded corners—Apple adds those automatically. A transparent icon may render poorly or be rejected during app processing. **Fix:** Create or export icon as 1024×1024 with solid white or dark-mode-appropriate background (matching the app theme). Re-export without transparency.

- [ ] **Build number not explicitly set in app.json.** The `app.json` lacks an explicit `ios.buildNumber` field. EAS config (`eas.json` §34) has `autoIncrement: true`, which is correct, BUT verify the first production build increments to `1` (not `0`) and increments correctly on each re-submit. **Check:** Monitor EAS build logs for "build number → 1" output.

- [ ] **No screenshots uploaded.** No `app-store-screenshots/` directory or assets found. Need **minimum 3–6 screenshots** at **6.9" iPhone resolution (1290×2796 px)**, with captions. APP_STORE_REVIEW_NOTES.md §4 prescribes six recommended shots: Home+record button, recording-in-progress, extraction review, Theme Map, Life Matrix, Entries list. Without these, the App Store listing will be bare and conversion will suffer. Also, reviewers test based on what you show them; show nothing = review may be shallow. **Fix:** Capture on physical device or simulator, add text overlays in Figma/Canva, export to 1290×2796, upload to ASC before submit.

- [ ] **Demo account not seeded.** Review notes (§2) call for `acuity.reviewer.b19@gmail.com` with 14 pre-populated entries, but no evidence that account has been created. **Fix:** (1) Create throwaway Gmail `acuity.reviewer.b19@gmail.com`. (2) Extend the seed-script allowlist in `/scripts/seed-test-user.ts:46-50` to include `acuity.reviewer*@gmail.com` pattern. (3) Run seed command: `npx tsx scripts/seed-test-user.ts --email acuity.reviewer.b19@gmail.com --name "Apple Reviewer" --subscription-status PRO --with-entries 14 --force`. (4) Verify sign-in and Theme Map unlocking on a TestFlight build. **Est. 30 minutes once TestFlight build is live.**

- [ ] **PrivacyInfo.xcprivacy is present but incomplete.** The file exists (`/apps/mobile/ios/Acuity/PrivacyInfo.xcprivacy`) and is copied during build, but contains only API usage types (`NSPrivacyAccessedAPITypes`), not collected data types. For a voice-journaling app with audio recording, microphone access, and user data storage, the manifest should explicitly declare `NSPrivacyCollectedDataTypes` including Audio Data and User Content. Current state may cause reviewers to flag the app as missing privacy disclosures. **Optional fix:** Manually add a section to the privacy manifest:
  ```xml
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeAudioData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <!-- User Content (transcripts) -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  ```
  (Mirrors the web privacy declarations in `docs/APP_STORE_PRIVACY.md` §1–2.)

- [ ] **TestFlight build not verified.** Review notes reference "Build 19" on TestFlight; no confirmation that it's uploaded or that the demo account (once seeded) can sign in successfully. **Fix:** After EAS builds for preview/production, download latest from TestFlight, install on a device, sign in with the reviewer account, verify Home tab loads 14 entries, Insights/Theme Map renders correctly, subscription shows "Active."

---

## NICE-TO-HAVE (post-first-review-pass)

- [ ] App preview video (10–30 seconds). Optional but recommended per APP_STORE_REVIEW_NOTES.md §4.4. Shape: Home → record → extract → Theme Map → Insights → end. Increases conversion post-launch.

- [ ] iPad screenshots. Optional; app sets `supportsTablet: false`, so iPad support is not a requirement.

- [ ] Custom entitlements plist with explicit signing team and provisioning profile. Current Expo auto-generation may be sufficient, but a custom `.entitlements` with `development-team` ID hardcoded would speed EAS signing.

- [ ] Expand the Privacy Manifest beyond API usage to include data minimization claims (e.g., "Audio deleted within minutes" per the privacy policy). Increases reviewer confidence in privacy posture.

---

## ACTION ITEMS REQUIRING JIM (Jim is the only person with App Store Connect, Apple ID, ASC App ID, or developer team access)

- [ ] **Implement Sign in with Apple.** This blocks the entire submission. Add to sign-in flow, add entitlements, test on device. **Owner:** Jim (Developer). **Est. 2–3 days.**

- [ ] **Add "Delete account" to mobile Profile.** Add MenuItem with destructive styling + confirmation dialog. **Owner:** Jim (or delegate to mobile engineer). **Est. 4–6 hours.**

- [ ] **Create reviewer Gmail account.** `acuity.reviewer.b19@gmail.com`, set Google profile name to "Apple Reviewer", share password securely for ASC. **Owner:** Jim. **Est. 5 min.**

- [ ] **Extend seed-script allowlist.** Modify `scripts/seed-test-user.ts:46-50` to accept `acuity.reviewer*@gmail.com` pattern, run seed command, verify on TestFlight. **Owner:** Jim (or engineer). **Est. 30 min.**

- [ ] **Rebuild/upload app icon with solid background.** Current icon has transparency. Re-export at 1024×1024 with opaque background, update `apps/mobile/assets/icon.png`. **Owner:** Designer or Jim. **Est. 30 min.**

- [ ] **Capture and upload 6 app screenshots.** Per APP_STORE_REVIEW_NOTES.md §4.1–4.3. Manual capture on device (not programmatic). Use Status Magic for clean status bar. Export to 1290×2796 (6.9" iPhone). Add captions. **Owner:** Jim (designer/product). **Est. 2 hours.**

- [ ] **Upload Build 19 to TestFlight.** EAS production build, wait for App Store processing (~15 min), verify in TestFlight. **Owner:** Jim (EAS CLI). **Est. 30 min.**

- [ ] **Fill in phone number in ASC review contact form.** Currently marked "TO FILL" in APP_STORE_REVIEW_NOTES.md §3. Add business or Google Voice line. **Owner:** Jim. **Est. 2 min.**

- [ ] **Verify app.json version matches review notes.** Review notes reference v0.1.7; app.json has v0.1.8. Align before final build, or update review notes. **Owner:** Jim. **Est. 2 min.**

- [ ] **Pre-submit grep verification.** Run from repo root before hitting submit in ASC:
  ```bash
  grep -rn "\$[0-9]\|12\.99\|99/mo\|/month\|Upgrade Now\|Subscribe\|Buy Now" apps/mobile/app apps/mobile/components
  ```
  Should return zero matches. If any land, remove before submit. **Owner:** Jim. **Est. 5 min.**

- [ ] **Monitor review queue while pending.** ASC inbox + jim@heelerdigital.com. Apple may ask for clarification on 3.1.3(b) multiplatform services framing or request re-submit with revisions. Response SLA: within 24 hours. Have APP_STORE_REVIEW_NOTES.md §5 (the defense framing) ready to paste if Apple flags 3.1.1. **Owner:** Jim. **Ongoing during review (24-48 hours).**

---

## Summary & Risk Assessment

**Confidence: Moderate → High IF Sign in with Apple is added.**

**Critical path:**
1. Sign in with Apple (2–3 days) — **blocks everything else**.
2. Account deletion (4–6 hours) — **mandatory**.
3. Screenshots (2 hours) — **strongly recommended**.
4. Demo account seeding (30 min) — **required for review**.
5. Icon transparency fix (30 min) — **good to have**.
6. TestFlight verification (30 min) — **sanity check**.

**Estimated total effort before submit:** 4–5 business days (assuming Sign in with Apple is the main unknown; account deletion and UI assets are straightforward).

**Subscription model risk:** Stripe-only approach is defensible under 3.1.3(b) but not guaranteed to pass. If rejected, RevenueCat + IAP fallback is 5–7 days post-rejection. Have that plan ready with the team.

**Privacy posture:** Strong. Privacy policy is live, privacy declarations are precise, and no forbidden SDKs (IDFA, third-party ad networks) are in the bundle. Privacy Manifest is minimal but acceptable.

**No showstoppers except Sign in with Apple.** Once that's added + account deletion is wired + screenshots are in place, submission can proceed with moderate confidence.

