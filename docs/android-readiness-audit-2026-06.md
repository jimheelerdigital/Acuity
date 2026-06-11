# Android readiness audit — 2026-06-10

Heeler Digital is an approved Google Play Org (June 2026) → Android can ship
**straight to production** (no 14-day Closed Testing rule). **Goal of the
slice:** prove the Expo toolchain produces a working Android build + claim
the Play listing with a baseline. **Not** shipping Android-specific features
— parity-by-default governs everything after.

**Headline:** the app is **architecturally Android-ready**. There's already
real groundwork (AAB build profile, Play submit profile + service account,
Play listing docs, assetlinks with a populated SHA-256). The remaining work
is mostly **config + console setup**, with a few small **code branches**.

---

## 1. What works as-is ✅

| Area | Status | Evidence |
|---|---|---|
| **Package / version** | ✓ | `com.heelerdigital.acuity` matches iOS bundle; `version` shared (1.3.2); `versionCode` auto-incremented by EAS (`appVersionSource: remote` + `autoIncrement`) — the static `1` in app.json is ignored, like iOS buildNumber |
| **AAB build profile** | ✓ | `eas.json` production → `android.buildType: "app-bundle"` (Play requires AAB), `distribution: store`, `channel: production` |
| **Play submit profile** | ✓ | `eas.json` submit production → `serviceAccountKeyPath: ./secrets/play-service-account.json`, `track: internal`, `releaseStatus: draft`; key file present |
| **Play listing docs** | ✓ | `docs/play-store-listing/`: short + full description, data-safety form, content-rating answers, icon/graphics checklist, `icon-512.png` |
| **App Links / assetlinks** | ✓ | `apps/web/src/app/.well-known/assetlinks.json/route.ts` serves `delegate_permission/common.handle_all_urls` for `com.heelerdigital.acuity` with the EAS SHA-256 populated (`37:DA:…:E8:71`); app.json intentFilter for `getacuity.io/api/auth/verify-email` (autoVerify) |
| **Apple Sign-In** | ✓ | Correctly `Platform.OS === "ios"`-guarded (`app/(auth)/sign-in.tsx:73`) → hidden on Android; **Google + email are the Android fallback** |
| **Audio recording + upload** | ✓ | `Audio.RecordingOptionsPresets.HIGH_QUALITY` → Android emits mp4/AAC; `/api/record` → Whisper accepts mp4/m4a both; upload path platform-agnostic |
| **Biometric app-lock** | ✓ | `expo-local-authentication` is cross-platform; degrades gracefully (biometric→passcode→none) on Android — no code change |
| **Adaptive icon + splash** | ✓ (basic) | `adaptiveIcon` foregroundImage + `backgroundColor #15131D`; splash configured. (Optional: a monochrome layer for Android-13 themed icons.) |
| **Cross-platform deps** | ✓ | `expo-auth-session`, `expo-av`, `expo-notifications`, `react-native-iap@^15` (supports Play Billing), `expo-web-browser`, `expo-secure-store`, sentry — all support Android. `expo-tracking-transparency` is an iOS no-op on Android. |
| **Server Google-auth** | ✓ | `api/auth/mobile-callback` already accepts `GOOGLE_ANDROID_CLIENT_ID` in its audience all-list — server side is ready for Android |

---

## 2. What needs adding (config / console — little or no code) 🔧

| Item | Where | Notes |
|---|---|---|
| **Android OAuth client ID** | Google Cloud Console | Create an Android OAuth client bound to `com.heelerdigital.acuity` + the **EAS signing-keystore SHA-1**. Then set `GOOGLE_ANDROID_CLIENT_ID` (Vercel env, server already reads it) + `googleAndroidClientId` in app.json `extra`. |
| **FCM credentials** | Firebase + Expo | Android Expo push routes through FCM. Create a Firebase project for `com.heelerdigital.acuity`, generate the FCM V1 service account, upload to the Expo project (`eas credentials` / Expo dashboard). Without it, remote push silently no-ops on Android (local reminders still work). |
| **`POST_NOTIFICATIONS` permission** | `app.json android.permissions` | Required for Android 13+ push. Runtime prompt already handled by `registerPushTokenAfterRecording` (push-token.ts). |
| **Play Console in-app products** | Play Console | Create the subscription products (reuse SKU names `com.heelerdigital.acuity.pro.monthly` / `.annual`); set prices; activate. Enable billing for the app. |
| **Content-rating questionnaire** | Play Console | Docs drafted (`content-rating-answers.md`) — must be submitted in-console. |
| **Data-safety form** | Play Console | Drafted (`data-safety-form.md`) — enter in-console. |
| **Store graphics** | Play Console | Feature graphic + phone screenshots (Android sizes) per `icon-and-graphics.md`. |
| **Play-issued SHA-256** | `assetlinks.json` route | After the first AAB upload, **Play App Signing** re-signs with Google's key — add that SHA-256 to the `SHA256_FINGERPRINTS` array so prod users get verified App Links (the route already has a TODO comment for this). |
| **Privacy policy URL** | (reuse iOS) | Same as iOS — already exists. |

---

## 3. What needs platform-specific code branches 🌿

| Branch | File | Change |
|---|---|---|
| **Google Sign-In client ID** | `apps/mobile/lib/auth.ts` (`useGoogleSignIn`) | Select `googleAndroidClientId` when `Platform.OS === "android"` (currently iOS-only) |
| **IAP enablement** | `apps/mobile/lib/iap.ts:143` | Currently `if (Platform.OS !== "ios") return null` — add the Android Play-Billing path (`react-native-iap@15` supports `requestPurchase({ google: { skus } })`) |
| **IAP receipt verify (server)** | `api/iap/verify-receipt` + `@acuity/shared/iap-flow` | Branch: iOS → Apple verify; Android → Google Play Android Publisher API. The shared decision logic is labeled "iOS"; add the Android classification path |
| **Android notification channel** | `notifications-boot.ts` / `_layout.tsx` | Add `setNotificationChannelAsync("default", { importance: MAX, lightColor: "#7C3AED" })` — Android 8+ needs a channel for remote push to render |
| **Audio interruption (polish)** | `app/record.tsx:204` | `InterruptionModeIOS` is iOS-only (ignored on Android — no crash). Optional `Platform.OS` branch for cleaner Android call-interruption handling |
| **Haptics (polish)** | settings/haptics usage | Guard any `expo-haptics` calls (silent no-op on devices without an engine) — low impact |

**Not an issue:** `ActionSheetIOS` — grep found zero usages. Face ID/app-lock — cross-platform already.

---

## 4. Estimates

**To first working Android build** (launches on a device/emulator, email auth + recording + the wake-lock fix all work): **~half a day.** The toolchain + AAB/APK profiles already exist — `eas build -p android --profile preview` (APK) should produce a runnable build now; the only functional gaps for a *basic* run are cosmetic. Google Sign-In + push won't work until their config lands, but email auth + the core record→extract loop will.

**To a Play-Store-submittable baseline** (AAB to the internal track, Google Sign-In + push + IAP working, listing + data-safety + rating complete): **~2–4 days** of focused work, gated mostly on **console setup** (Android OAuth client + SHA-1, FCM credentials, Play products, content-rating/data-safety submission, screenshots). Code is the small part (the §3 branches, ~half a day); the calendar risk is the Google Cloud / Firebase / Play Console round-trips.

**Suggested sequence for the slice:**
1. `eas build -p android --profile preview` → confirm it launches + records (toolchain validation). ½ day.
2. Android OAuth client + SHA-1 + `googleAndroidClientId` + the `useGoogleSignIn` branch → Google Sign-In works. ½ day.
3. FCM upload + `POST_NOTIFICATIONS` + notification channel → push works. ½ day.
4. Play products + IAP Android branch + server receipt verify → subscriptions work. ~1 day.
5. Play Console: data-safety, content rating, screenshots, feature graphic; `eas build -p android --profile production` (AAB) + `eas submit` to internal track; add Play-issued SHA-256 to assetlinks. ~1 day.

---

## 5. Risks / notes
- ⚠️ **IAP + receipt verify is the highest-risk branch** (live billing). It touches `@acuity/shared/iap-flow` (used by both clients) and a backend verify path — validate carefully on the internal track before any production promotion.
- The `useGoogleSignIn` + IAP changes touch **mobile-consumed auth/IAP contracts** → flag HIGH RISK + verify on a build before shipping.
- Parity-by-default kicks in after this baseline: v1.4.x features ship iOS + web + **Android** together. ([[feedback-parity-by-default]])
- **Queued behind v1.3.3** (background processing) — no Android code starts until v1.3.3 ships.
