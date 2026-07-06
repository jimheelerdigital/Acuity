# Play Console resubmission note — Acuity v1.3.4 (versionCode 24)

**For:** the "Broken Functionality" policy rejection of versionCode 21 (crash on launch).
**Status:** ready to paste. **Do NOT submit until the device smoke test passes** — and fill in the bracketed device/OS before pasting.

---

## Paste this into the Play Console resubmission / appeal note

> **Re: Broken Functionality — "Crashes for users" (previously reviewed build: versionCode 21)**
>
> **What was wrong in versionCode 21**
> versionCode 21 crashed on cold launch. Root cause: a build-configuration change excluded the `play-services-ads-identifier` library, which removed the `com.google.android.gms.ads.identifier.AdvertisingIdClient` class from the app. The Meta/Facebook SDK (initialized at app startup) references that class via `com.facebook.internal.AttributionIdentifiers`. With the class absent, the app threw `java.lang.NoClassDefFoundError` on launch — the "Acuity keeps stopping" crash captured during review.
>
> **What was fixed in versionCode 24**
> We removed that library exclusion, so `AdvertisingIdClient` is present again and the startup crash is resolved. We continue to strip the advertising-ID permissions (`com.google.android.gms.permission.AD_ID` and `android.permission.ACCESS_ADSERVICES_AD_ID`) at the manifest level, so the app remains consistent with our Data safety declaration — Acuity does not use an advertising ID.
>
> **How we verified**
> 1. Decoded the versionCode 24 app bundle: both advertising-ID permissions are absent, and `AdvertisingIdClient` is present.
> 2. Installed and ran versionCode 24 on a physical Android device ([DEVICE MODEL], Android [VERSION]): the app launches from cold start, completes sign-up, records an entry, and navigates throughout without crashing. No crashes were reported by our crash monitoring during the session.
> 3. Confirmed our crash monitoring shows no related crashes for this release.
>
> The crash was isolated to the Android build configuration above and did not affect any user-facing feature or content.

---

## Notes for Jim (not for pasting)
- Replace `[DEVICE MODEL]` / `[VERSION]` with the device you actually tested on.
- Only include verification point #2 once the smoke test has actually passed (cold launch → home → signup → record → ~5-min nav → zero new Sentry events). If you tested on an emulator instead, say "an Android emulator (API [N])".
- Per Play's notice, a formal **appeal is not required** for a resubmission of a minor violation — uploading versionCode 24 and submitting for review is sufficient. This note can go in the release notes / "what changed" field or an appeal if you choose to file one.
- Do not mention versionCodes 22/23 — those were failed internal EAS builds, never submitted, and would only confuse the reviewer.
