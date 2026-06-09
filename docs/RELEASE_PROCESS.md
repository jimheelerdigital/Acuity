# iOS release process (App Store)

Goal: stop hand-entering "What's New" / release settings in App Store
Connect on every release by wiring `eas metadata` alongside `eas submit`.

## Why `eas submit` alone isn't enough
`eas submit` uploads the **binary** to App Store Connect — it does **not**
set the version's release notes ("What's New"), review notes, or the
auto-release toggle. Those are App Store metadata, managed separately by
`eas metadata`.

## One-time setup (Jim, from a Mac with ASC access)
> ⚠️ HIGH RISK on a live app: `eas metadata:push` **overwrites** the live
> listing (name, subtitle, description, keywords, URLs) with whatever is in
> `store.config.json`. NEVER push a partial/guessed config — it will blank
> out live fields. Always **pull first** so the config mirrors the real
> listing, then only edit the fields you intend to change.

```bash
cd apps/mobile
eas metadata:pull --profile production   # writes store.config.json from the LIVE listing
git add store.config.json && git commit -m "chore(ios): baseline ASC metadata from live listing"
```

`store.config.json` is the default path EAS reads; no eas.json change needed
(the production submit profile already has appleId + ascAppId).

## Per-release flow (every version bump)
1. Edit `apps/mobile/store.config.json` → `apple.info["en-US"].releaseNotes`
   (the "What's New" text). Optionally set the version's release type to
   automatic under the `apple.version` block.
2. Push metadata, then build + submit:
   ```bash
   eas metadata:push --profile production   # diff is printed — review before confirming
   eas build   --platform ios --profile production
   eas submit  --platform ios --profile production --id <BUILD_ID>
   ```
3. In ASC, attach the processed build to the version (still a manual click
   until App Store Versions metadata is fully managed by eas metadata).

## v1.3.1 release notes (for the current submission — build 76)
Paste into ASC now (or into `releaseNotes` once the config is baselined):

> Bug fixes — date display corrected, manual task and goal add with native
> calendar picker, refreshed list styling.

Review notes: minor patch on v1.3, same test credentials, no review-relevant
flow or permission changes. Release: automatically after approval.

## Android (parity, when promoted past internal)
`eas submit --platform android` reads release notes from
`android/.../release-notes/` or the Play submit config. Mirror the same
per-release note text. Track is `internal` (draft) today.
