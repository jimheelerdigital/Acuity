# Keyboard-avoidance audit — apps/mobile (every TextInput surface)

**Date:** 2026-07-02 · **Status:** Audit only (no code changed) · **Branch state:** `main`
**Goal:** every screen/modal that mounts a native keyboard keeps the focused input visible above it. This inventories the current state so the app-wide fix can be finished.

> **Reflects `main`.** Three fixes are in-flight and **not merged** — they change three rows below: **PR #26** (entry/`[id]` host → `automaticallyAdjustKeyboardInsets`, fixes transcript-editor + extraction-review), **PR #28** (sign-in → padding-only KAV). PR #27 is the tour fix (unrelated to keyboard). Rows note "on main" vs "in-flight".

## Key terms
- **PR #26 pattern** = `ScrollView` with `automaticallyAdjustKeyboardInsets` (iOS auto-scrolls the focused input into view) + `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode`. This is the only pattern here that truly **scrolls the focused input into view** (not just pads).
- **`KeyboardAwareScreen`** (`components/keyboard-aware-screen.tsx`) = `KeyboardAvoidingView behavior="padding"` → `ScrollView` (flexGrow:1, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode`). It **pads + is scrollable, but does NOT auto-scroll the focused input into view** — for a short form the padding lifts enough; for a long form the user must scroll manually. It **is a ScrollView**, so it is **forbidden on OAuth screens** (f4297d1).
- **KAV-padding** = `KeyboardAvoidingView behavior="padding"` (no auto-scroll; pads the container).
- **f4297d1** = the reverted regression where a `ScrollView` ancestor of an OAuth button re-laid-out during `promptAsync()` and tore down the `SFAuthenticationSession` sheet → sign-in returned `cancelled`. **Rule: any screen that mounts a Google/Apple session must NOT put the OAuth button under a ScrollView; use padding-only.**

---

## Inventory — every input surface

| # | Surface | Input(s) | Current keyboard handling | Focused input visible? | Broken? | Correct pattern |
|---|---|---|---|---|---|---|
| 1 | `app/(auth)/sign-in.tsx` | email, password | **none on main** (PR #28 adds form-scoped KAV-padding) | ❌ password covered | **YES (main)** | **B — padding-only** (PR #28) ✅ in-flight |
| 2 | `app/onboarding-new/account.tsx` | email, password/name **+ Google & Apple OAuth** | **`ScrollView` wraps the OAuth buttons** + `keyboardShouldPersistTaps`; no KAV | inputs scroll, **but OAuth is under a ScrollView** | **YES — ⚠️ f4297d1 RISK** | **B — padding-only; move OAuth out of the ScrollView** |
| 3 | `app/(auth)/sign-up.tsx` | email, password, name (**no OAuth**) | `KeyboardAwareScreen` (pads + scrollable) | ✅ (short form) | No | B-safe: OK **only because no OAuth**; if OAuth is ever added, must switch to padding-only |
| 4 | `app/(auth)/forgot-password.tsx` | email (**no OAuth**) | `KeyboardAwareScreen` | ✅ (single input) | No | Fine as-is |
| 5 | `components/entry/transcript-editor.tsx` | transcript (multiline) | none in component; host `entry/[id]` = **bare ScrollView on main** (PR #26 → `automaticallyAdjustKeyboardInsets`) | ❌ on main | **YES (main)** | **A — PR #26** (host) ✅ in-flight |
| 6 | `components/extraction-review.tsx` | edit extracted item | none in component; same host `entry/[id]` (bare ScrollView on main) | ❌ on main | **YES (main)** | **A — PR #26** (host) ✅ in-flight |
| 7 | `app/(tabs)/goals.tsx` — **review-suggestions modal** (`Modal` slide, ~L1363) | edit suggestion | `ScrollView`, **no KAV / no insets** | ❌ input can be covered | **YES** | **A — add insets/persistTaps to the modal ScrollView** |
| 8 | `app/(tabs)/goals.tsx` — **add/edit-goal modal** (~L1124) | goal title | bottom-sheet **KAV-padding** (no ScrollView) | ✅ (padding lifts the sheet) | No | Fine (padding is correct for a bottom sheet) |
| 9 | `app/task/[id].tsx` | title, description | KAV-padding + ScrollView (no insets/persistTaps on main) | ✅-ish (pads + manual scroll) | No (weak) | **A — upgrade** to insets + persistTaps |
| 10 | `app/task/new.tsx` | title, description | KAV-padding + ScrollView | ✅-ish | No (weak) | **A — upgrade** |
| 11 | `app/goal/[id].tsx` | title, description | KAV-padding + ScrollView | ✅-ish | No (weak) | **A — upgrade** |
| 12 | `app/goal/new.tsx` | title, description | KAV-padding + ScrollView | ✅-ish | No (weak) | **A — upgrade** |
| 13 | `components/progress-suggestion-banner.tsx` | inline edit | none in component; host `goal/[id]` (KAV-padding + ScrollView) | ✅-ish (host pads) | No (weak) | **A — inherits host upgrade** |
| 14 | `components/delete-account-modal.tsx` | typed-confirm | `Modal` + KAV-padding + ScrollView + `keyboardShouldPersistTaps` | ✅ | No | **Reference example** for Category A modals |
| 15 | `components/feedback-modal.tsx` | feedback text | `Modal` + KAV-padding + ScrollView + `keyboardShouldPersistTaps` | ✅ | No | **Reference example** |
| 16 | `components/onboarding/step-3-demographics.tsx` | demographics fields | wrapped by `components/onboarding/shell.tsx` = KAV-padding + ScrollView + `keyboardShouldPersistTaps` | ✅-ish | No | **A — shell** (upgrade shell to insets to be safe on long steps) |
| 17 | `app/(tabs)/entries.tsx` | search bar (top, in FlatList header) | none; `FlatList` w/o keyboard props | ✅ (top-positioned, keyboard is below) | No (minor) | Add `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode` to the FlatList (tap a result with keyboard up) |
| 18 | `app/insights/people.tsx` | name filter (top, in ScrollView) | `ScrollView`, no KAV/insets | ✅ (top-positioned) | No (minor) | Add `keyboardShouldPersistTaps` + insets for safety |

**Broken / at-risk (act on these):**
- **#2 `onboarding-new/account.tsx` — ⚠️ HIGH: OAuth under a ScrollView (f4297d1 pattern), shipped.**
- **#1 sign-in** (fixed in-flight #28), **#5 transcript-editor + #6 extraction-review** (fixed in-flight #26 via the shared host), **#7 goals review-suggestions modal** (no fix yet).
- Weak (pads but no true scroll-into-view): #9–#13, #16 — fine for short forms, upgrade for robustness.

---

## AUTH-CRITICAL screens (separate flags — ScrollView-relayout FORBIDDEN)

Screens that mount a Google/Apple `SFAuthenticationSession`. The `KeyboardAwareScreen`/any-ScrollView approach is **banned** here; they need **padding-only, no ScrollView, OAuth buttons outside the wrapper**.

| Screen | Mounts OAuth? | Current | Verdict |
|---|---|---|---|
| `app/(auth)/sign-in.tsx` | **Yes** (Google + Apple) | none on main → **PR #28** wraps only the form in KAV-padding, OAuth left outside | ✅ correct approach in-flight |
| `app/onboarding-new/account.tsx` | **Yes** (Google + Apple) | **OAuth buttons are INSIDE a `ScrollView`** (L344–591) | ❌ **forbidden pattern present. NOT on the default signup path (see Routing verification below) — reachable only via the `/onboarding-new/*` Meta-ad deep-link funnel. Live exposure = whether Meta ads currently deep-link into that funnel. Must convert to padding-only if/when that funnel is active.** |

### Routing verification (2026-07-02) — is `onboarding-new/account.tsx` on the live signup path?

**Definitively: NO for the default app flow; only via an external Meta-ad deep link.**
- Cold launch → `AuthGate` (`app/_layout.tsx:189`) routes every unsigned launch to **`/(auth)/sign-in`** unconditionally. The `isNewOnboardingEnabled` flag that used to route cold-launches into the funnel was **removed** in v1.3 (2026-06-03) — see `lib/feature-flags.ts`.
- A new user who signs up then hits `AuthGate` (`_layout.tsx:241`) → **`router.replace("/onboarding?step=N")`** = the **legacy `/onboarding`** flow (`app/onboarding.tsx` → shell + `step-3-demographics`), which has **no OAuth buttons**. So the normal signup never renders `account.tsx`.
- `/onboarding-new/*` is entered **only via an external deep link** (`app.json` scheme `acuity` + `applinks:getacuity.io`). **Nothing in the mobile app or the web codebase routes into the funnel entry** (`grep` for pushes into `/onboarding-new/pain` and web refs to `onboarding-new` → none). Its own comment says it "remains reachable via Meta-ad deep links but is no longer the default cold-launch destination."
- Once inside the funnel, the chain **does** reach it: `…/reveal:509` → `/onboarding-new/account` → renders Google/Apple unconditionally → `…/paywall`.

**Conclusion:** the OAuth-under-ScrollView is a **latent** risk, not a default-path regression. It is live **only if a Meta-ad campaign is currently deep-linking users into `/onboarding-new/*`** — an ad-platform (adlab/Keenan) fact not visible in this repo. Confirm active campaigns before prioritizing.
| `app/(auth)/sign-up.tsx` | No | `KeyboardAwareScreen` (ScrollView) | ⚠️ Safe **only** because it has no OAuth session. If Google/Apple is ever added here, it must switch to padding-only first. |
| `app/(auth)/forgot-password.tsx` | No | `KeyboardAwareScreen` | OK (no OAuth). |

Any change to sign-in / onboarding-new/account requires the full **`docs/AUTH_HARDENING.md`** checklist (web Google/Apple/password + mobile Google/Apple on a real build) before OTA/deploy.

---

## Proposed consistent approach (two categories — do NOT implement here)

### Category A — normal screens & modals (everything except OAuth screens)
**Standard scroll-into-view pattern** = the PR #26 pattern applied at the scroll container:
- `ScrollView` (or `FlatList`) with **`automaticallyAdjustKeyboardInsets`** (iOS — the piece that actually scrolls the focused input above the keyboard), **`keyboardShouldPersistTaps="handled"`**, and **`keyboardDismissMode`** (`interactive` iOS / `on-drag` Android). No-op safe on Android (native `adjustResize`).
- **Recommended: upgrade the shared `KeyboardAwareScreen` to add `automaticallyAdjustKeyboardInsets`** (today it only pads), then it becomes the single canonical wrapper for all non-auth input screens — one fix propagates to #3–#4, #16, and any future screen. Screens with a bespoke `ScrollView` (#5/#6 host, #7, #9–#13, #17, #18) either adopt the wrapper or add the three props inline.
- Modals (#14/#15) already model this well (KAV-padding + ScrollView + persistTaps) — align #7 to them.

### Category B — auth / OAuth screens (sign-in, onboarding-new/account, future OAuth screens)
**Auth-safe padding-only pattern** (the PR #28 approach):
- **No `ScrollView` anywhere** in the render tree that contains an OAuth button.
- Wrap **only the email/password form** in a `KeyboardAvoidingView behavior="padding"`; keep the Google/Apple buttons **outside** the wrapper.
- `KeyboardAvoidingView` reacts only to keyboard-frame events (none fire during an OAuth tap), so it can't reproduce f4297d1.
- Gate every change behind `AUTH_HARDENING.md`.

### Suggested priority
1. **#28 (sign-in) and #26 (transcript/extraction host)** — already in-flight; land these first. Sign-in is the **actual** default OAuth screen every new user hits.
2. **#2 `onboarding-new/account.tsx`** — HIGH **only if** a Meta-ad campaign is currently deep-linking into `/onboarding-new/*` (see Routing verification — it is NOT on the default signup path). Confirm active campaigns with Keenan/adlab; if live, convert to Category B (auth-review required); if dormant, it's cleanup-priority.
3. **#7** goals review-suggestions modal — Category A.
4. Upgrade `KeyboardAwareScreen` to insets, then sweep #9–#13, #16, and align #17/#18 — Category A polish.

No code changed in this audit.
