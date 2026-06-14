# Acuity Parity Playbook

Parity across iOS / Android / web is a **hard requirement, not aspirational.**
Every feature and design change lands on all target platforms simultaneously
(Android pre-considered), built from a single spec with a shared source of
truth. Never ship one platform and chase parity afterward.

These rules are enforced in code review. Add to them as new divergences are found.

---

## 1. Icon-font glyphs in Modals/overlays → use SVG (Android render risk)

> Icon-font glyphs (`@expo/vector-icons`, `react-native-vector-icons`) rendered
> inside Modal/Portal/overlay components are an Android render risk — Android's
> separate Modal window may not flush the icon font registration. Default to
> `lucide-react-native` (SVG-based icon components, already a dependency) or
> `react-native-svg` paths for any glyph inside such components. A lint rule or
> PR-template check would catch future cases.

- **Confirmed 2026-06-14:** the product-tour Next/Back chevrons
  (`react-native-spotlight-tour`'s `<Modal>`) rendered blank on Android while
  iOS showed them from identical code. Fixed by switching to `react-native-svg`
  paths in `apps/mobile/components/tour/TourTooltip.tsx`.
- spotlight-tour itself draws its spotlight cutout with `react-native-svg` in
  the same Modal — proof SVG renders reliably in that overlay on both platforms.
- Verify on-device when adding any glyph inside a Modal/Portal/BottomSheet.
- **2026-06-14 (v11):** swept the codebase and pre-emptively converted all 5
  remaining sibling cases (delete-account, feedback, celebration, entry-detail,
  goals modals) to `lucide-react-native` so the whole risk class is eliminated,
  not just the confirmed tour failure.

## 2. Don't zero-out Android values — use `Platform.select` with an Android branch

> `Platform.OS === "ios" ? <value> : 0` that drops the Android value is an
> automatic code-review red flag. It needs a `Platform.select` with a real
> Android branch instead.

- Most common case: shadows. RN `shadow*` props don't render on Android — map
  them to `elevation` via
  `Platform.select({ ios: shadowStyles, android: { elevation: N } })`, not `0`.
- Exception (judgment required): values that are *legitimately* platform-
  specific and correctly `0` on Android — e.g. a `KeyboardAvoidingView`
  `keyboardVerticalOffset` (Android handles keyboard insets natively).

## 3. "Fix from N builds ago not working on Android" → verify, don't guess

When a shipped fix appears missing on one platform, the default is:
**find the commit → verify it shipped in the build → verify it renders.**

- Get the build's exact commit (`eas build:view <id>`), confirm the fix commit
  is an ancestor (`git merge-base --is-ancestor <fix> <build-commit>`).
- If the commit is present, it's a render/asset/font issue (see rule 1), not a
  stale build. Don't cut a "fresh" build off an older commit — verify lineage
  first (a build can be *ahead* of the platform you're comparing against).
- Watch for **build-profile / feature-flag** differences too: two builds on the
  same commit can differ if their EAS profiles set different `EXPO_PUBLIC_*`
  flags (e.g. `EXPO_PUBLIC_PIPELINE_ASYNC` in `testflight-async` vs
  `production`).
