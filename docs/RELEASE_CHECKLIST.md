# Mobile Release Checklist (iOS + Android)

**Why this exists:** v1.3.4 vc21 was rejected by Google Play (Broken Functionality — 100% cold-launch crash) because a native-dependency change (`play-services-ads-identifier` gradle exclude) was validated **only by decoding the AAB manifest**, never by running the app. AAB decode confirms *what's in the bundle*; it does **not** confirm *the app launches*. This checklist closes that gap.

**Hard rule:** **No store submission (App Store or Play) without a runtime smoke test on a real device or emulator on the exact build being submitted.** Manifest/AAB inspection is necessary but **never sufficient**.

---

## Risk tiers — how much testing a change needs

| Tier | Change type | Required before submit |
|---|---|---|
| **HIGH** | Anything native: config plugins, `expo-build-properties`, dependency add/remove/exclude, `app.config`/`app.json` native keys, Gradle/Podfile, permissions, IAP, push/FCM, SDK upgrades (Expo/RN) | Full smoke test (below) on **both** a physical device **and** an emulator/simulator + the AAB/IPA decode checks |
| **MEDIUM** | JS/TS behavior changes that touch startup, auth, navigation, recording pipeline | Full smoke test on at least one real device |
| **LOW** | Copy, styling, web-only, non-startup JS | Smoke test on emulator/simulator |

> The vc21 crash was a HIGH-tier change (config plugin + gradle exclude) shipped with zero runtime testing. That can't happen again.

---

## Pre-submit smoke test (the minimum gate)

Run on the **production build artifact** (the EAS AAB/IPA), not a dev/Expo-Go build, on **at least one real device** (HIGH/MEDIUM tier) — installed from the artifact (`adb install`/internal track for Android; TestFlight for iOS):

1. **Cold launch** — kill the app, launch fresh. **No crash.** (This alone would have caught vc21.)
2. **Reach Home** — onboarding/landing renders, no white screen.
3. **Sign up** (or sign in) — full auth flow completes.
4. **Record an entry** — record → upload → it appears (the core loop).
5. **Navigate ~5 min** — tabs, settings, paywall, account; background → foreground; rotate if applicable.
6. **Zero new Sentry events** during the session (watch the Sentry release dashboard live, filtered to the build's release/dist).
7. **Permissions sanity** — mic prompt works; no unexpected permission prompts.

Any crash, ANR, or new Sentry event = **do not submit**; triage first.

---

## AAB / IPA artifact checks (in addition, not instead)

For Android, after the EAS build, decode the AAB and verify:
- `com.google.android.gms.permission.AD_ID` — **absent**
- `android.permission.ACCESS_ADSERVICES_AD_ID` — **absent**
- `com.google.android.gms.ads.identifier.AdvertisingIdClient` — **PRESENT** (the class must stay; only the permission is removed — see `apps/mobile/plugins/with-remove-ad-id.js`)
- versionCode incremented (EAS remote auto-increment)

```bash
# permissions
bundletool dump manifest --bundle <build>.aab | grep -i 'AD_ID\|ADSERVICES_AD_ID'
# class presence (quick): unzip dex + strings
unzip -o <build>.aab 'base/dex/*' -d /tmp/aab && strings -a /tmp/aab/base/dex/*.dex | grep -c 'AdvertisingIdClient'
```

---

## Recommended automation (next step, not blocking today)

**Maestro smoke flow** — a `.maestro/smoke.yaml` that scripts steps 1–5 above, run against the EAS build before every submit. Maestro is the lightest RN/Expo E2E option (YAML flows, no native test harness).

- **Local/manual:** `maestro test .maestro/smoke.yaml` against an installed production build.
- **CI gate:** EAS Build → upload to Play **Internal testing track** (not production) → run the Maestro flow against an emulator on that artifact → promote to production **only on green**. Maestro Cloud or a self-hosted emulator in GitHub Actions both work.
- **First flow to write:** `launch → assert Home visible → sign up → record entry → assert entry appears → navigate 3 tabs → assert no crash`. Expand over time.

This turns "did anyone remember to test it?" into a required, automated check — the durable fix for the process gap, beyond this one bug.

---

## Sign-off (paste into the release PR / submission ticket)

```
Build: acuity@<versionName> (vc/build <N>)  ·  Platform: <android|ios>
Tier: <HIGH|MEDIUM|LOW>
Smoke test: device <model/OS> ☐ pass   emulator <api> ☐ pass
  cold launch ☐  home ☐  signup ☐  record ☐  5-min nav ☐  zero Sentry events ☐
AAB/IPA checks: AD_ID absent ☐  ACCESS_ADSERVICES_AD_ID absent ☐  AdvertisingIdClient present ☐
Submitted by: ___   Date: ___
```
