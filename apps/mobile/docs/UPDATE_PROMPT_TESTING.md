# In-app update prompt — manual test checklist

How to verify the version-check + UpdatePromptModal end-to-end before
the v1.2 cutover that activates the prompt for live users.

The mobile codebase has no Jest/Vitest setup; this checklist is the
substitute. Run through it in a debug build (`pnpm start`, then
iOS simulator) before each release that touches `lib/version-check.ts`
or `components/UpdatePrompt*.tsx`.

## Pre-flight

1. Confirm the mobile dev build's `app.json` version (`expo.version`).
   That's what `Constants.expoConfig.version` reports.
2. Confirm the server config (`apps/web/src/lib/app-version-config.ts`)
   is pointing at the right Vercel deploy you're testing against.
   Local dev usually uses prod's config; if you want to test against
   modified config, hit `vercel dev` locally and override
   `EXPO_PUBLIC_API_URL`.

## Scenario 1 — Soft nudge on launch

**Setup**: Server `recommendedVersion` > current app version. Example:
app.json `version: "1.0.0"`, server config `recommendedVersion: "1.1.0"`.

**Steps**:
1. Cold-launch the app.
2. Wait for the splash → first frame.

**Expected**:
- Modal slides up over the home/sign-in screen within ~280ms of mount.
- Headline + body rendered atmospheric.
- Two buttons visible: `Update` (gradient) + `Later` (text-only below).
- No footer "This update is required to continue." line.
- No ambient pulse or shimmer.

## Scenario 2 — Tap Update

**Steps**: From Scenario 1's modal state, tap the gradient "Update"
button.

**Expected**:
- iOS simulator: `itms-apps://` link will likely fail (no App Store
  app in the simulator) but `Linking.openURL` still fires. Look for
  console output. The modal stays visible.
- Real device: App Store opens to the Acuity product page. The
  app's modal stays mounted in the background.
- Returning to Acuity: modal still visible.

## Scenario 3 — Tap Later, dismiss persists

**Steps**: From Scenario 1's modal state, tap "Later".

**Expected**:
- Modal fades + scales out over ~280ms.
- AsyncStorage key `update-prompt-dismissed-version` is set to the
  server's `recommendedVersion` value. Verify with:
  ```js
  // In the debug console / shake-menu:
  AsyncStorage.getItem("update-prompt-dismissed-version").then(console.log)
  ```

**Re-launch verification**:
4. Kill the app and cold-launch again.
5. Expect: modal does NOT appear. The version check still fires; the
   dismiss state suppresses it.

## Scenario 4 — Bumped recommendedVersion re-arms

**Setup**: After Scenario 3, edit the server config to bump
`recommendedVersion` (e.g., "1.1.0" → "1.2.0"). Redeploy.

**Steps**:
6. Wait for the CDN cache TTL (5 min) OR purge with `vercel cache
   delete`.
7. Cold-launch the app.

**Expected**: Modal appears again. The stored dismiss
("update-prompt-dismissed-version" = "1.1.0") is older than the new
`recommendedVersion` "1.2.0", so the gate trips again.

## Scenario 5 — Force update mode

**Setup**: Set server config `minimumVersion: "1.1.0"` while the
running app is still at `1.0.0`. (Be VERY careful with this on prod
— this will brick anyone on an older build.)

**Steps**:
8. Cold-launch the app.

**Expected**:
- Modal appears.
- NO "Later" button visible.
- Footer line "This update is required to continue." rendered in
  mono uppercase below the CTA.
- Hardware back / iOS swipe-down does nothing.

**Reset**: lower `minimumVersion` back to "1.0.0" before continuing.

## Scenario 6 — Network failure path

**Setup**: Airplane mode (or kill Vercel preview / use an invalid
`EXPO_PUBLIC_API_URL`).

**Steps**:
9. Cold-launch the app.

**Expected**:
- App boots normally.
- NO modal appears.
- No crash, no error overlay.
- The 4s AbortController bound prevents the launch flow from
  hanging on the network call.

## Scenario 7 — Reduce Motion respected

**Setup**: iOS Settings → Accessibility → Motion → Reduce Motion ON.

**Steps**:
10. Set up Scenario 1 (soft nudge should show).
11. Cold-launch.

**Expected**:
- Modal appears INSTANTLY (no 280ms fade-up).
- Tapping Later dismisses INSTANTLY (no fade-down + scale-down).

## Scenario 8 — Small + large screen render

**Steps**:
12. Run scenarios 1 + 5 on iPhone SE (smaller, 4.7" diagonal).
13. Run scenarios 1 + 5 on iPhone 16 Pro Max.

**Expected on SE**:
- Modal content fits without scrolling.
- No clipped text.
- CTAs reachable with thumb.
- HeroCard padding tight but readable.

**Expected on Pro Max**:
- Modal max-width caps at 380 (per `maxWidth: 380` in
  UpdatePromptOverlay). Doesn't stretch to fill the screen.
- Generous breathing room around the card.

## Scenario 9 — Mid-onboarding launch

**Setup**: Sign up a fresh account, get partway through onboarding,
kill the app. Configure server for Scenario 1 (soft nudge).

**Steps**:
14. Cold-launch.

**Expected**:
- AuthGate routes the user to the in-progress onboarding step.
- Update prompt modal appears on top of the onboarding step.
- Tapping Later dismisses; the underlying onboarding step is still
  there.

## Scenario 10 — App-lock interaction

**Setup**: Enable app lock in Profile (Face ID). Configure server
for Scenario 1.

**Steps**:
15. Cold-launch.

**Expected**:
- Lock overlay appears FIRST.
- Update prompt modal appears UNDER the lock overlay (you'll see it
  briefly during the lock-overlay fade).
- After successful unlock, the update prompt is visible.

This z-order is intentional: `<UpdatePromptOverlay />` is mounted
BEFORE `<LockScreenOverlay />` in `_layout.tsx → ThemedApp`.

---

## Known limitations

- **No automated tests.** The `compareVersion` / `isOlderThan`
  comparator is pure logic and could be unit-tested if/when we add
  Jest to the mobile package.
- **Server config TTL is 5 min.** Emergency force-update propagation
  worst-case takes 5 minutes. Acceptable for non-life-critical
  updates; if a P0 bug needs immediate force-update, also `vercel
  cache delete` to purge the edge cache.
- **No per-build / per-segment targeting.** If we ever need to
  force-update only a specific build (e.g. "everyone on build 42 in
  Australia") we promote the static config to a Prisma model + admin
  UI. v1.0 of this feature explicitly scopes that out.

---

*Last updated: 2026-05-23 (slice 5 ship)*
