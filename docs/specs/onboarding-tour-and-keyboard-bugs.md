# vc24 on-device bugs — diagnosis (tour + keyboard)

**Date:** 2026-07-02 · **Status:** Diagnosis only (no fixes) · **Build:** Android vc24 / current mobile
**Scope:** three issues found testing vc24 on device. Root cause + file + code path + proposed approach for each. Nothing implemented.

---

## Issue 1 — First-login tour auto-fired for an existing, active user (demo@example.com)

**Symptom:** signed in as `demo@example.com` (existing account, prior data) on a fresh install → the coach-mark tour launched.

**Confirmed server state** (Supabase, project `rohjfcenylmfnqoyoirn`): `totalRecordings = 27`, `tourCompletedAt = 2026-06-17`, onboarding `completedAt = 2026-06-15`, 27 complete entries. **Per the gate logic, all server gates should have blocked the auto-fire — yet it fired.**

### Root cause — the auto-fire gate fails *open* on not-yet-hydrated server fields, and the only device-level guard resets on reinstall.

Gate: `hooks/use-tour-trigger.ts` → `useTourTrigger()` auto-fire `useEffect`:
```
if (!user) return;
if (!user.onboardingCompleted) return;
if ((user.totalRecordings ?? 0) > 0) return;   // (undefined ?? 0) = 0 → 0 > 0 = false → does NOT block
if (user.tourCompletedAt != null) return;       // undefined != null → false → does NOT block
if (queueHasItem) return;
const localMarker = await AsyncStorage.getItem("acuity.tour.completed"); // wiped on reinstall
```

The gate is on **both** a server field **and** a local flag, but both fail open on a fresh install of an existing account:

1. **Server fields are `undefined` at first sign-in.** The `User` type marks them optional (`lib/auth.ts:75` `totalRecordings?: number`, `:80` `tourCompletedAt?: string | null`, `:87` `onboardingCompleted?: boolean`). The mobile-login response **does not select them** — `apps/web/src/app/api/auth/mobile-login/route.ts` `select` returns id/email/…​ + `onboarding: { completedAt, currentStep }` but **omits `totalRecordings` and `tourCompletedAt`**. On sign-in, `signInWithPassword` → `setAuthenticatedUser(next)` → `setUser(next)` (`contexts/auth-context.tsx:384–386`) sets a **partial** user: `onboardingCompleted = true` (from `onboarding.completedAt`) but `totalRecordings = undefined`, `tourCompletedAt = undefined`.
2. **The gate treats "unknown" as "eligible."** `(undefined ?? 0) > 0` is `false` and `undefined != null` is `false` (loose inequality: `undefined == null`). So both authoritative gates pass while the fields are unhydrated.
3. **The local backstop is gone.** `acuity.tour.completed` in AsyncStorage is device-level and **wiped by the reinstall**, so the secondary `localMarker` check is `null` and can't catch it.
4. **500 ms later `fireTourStart("auto")` runs** and the tour launches. The subsequent `/api/user/me` refresh sets the real values (27 / 2026-06-17), but `firedRef.current` is already `true`.

**Why an existing user, why only on fresh install:** on a normal (non-reinstalled) device, the cached `stored` user (`auth-context.tsx:186 setUser(stored)`) already carries `totalRecordings`/`tourCompletedAt` from a prior `/me`, **and** the local marker is present — both block. A fresh install has no cached user (partial login user → undefined fields) and no local marker → both guards fail open in the window between login and the first `/me` hydration.

**Files / code path:** `hooks/use-tour-trigger.ts` (gate) · `contexts/auth-context.tsx:384–386` (partial user on sign-in) · `apps/web/src/app/api/auth/mobile-login/route.ts` (`select` omits the two fields) · `lib/auth.ts:75,80,87` (optional fields).

**Proposed fix approach (not implemented):** make the gate **fail safe on unknown** — only auto-fire once the fields are known: e.g. `if (user.totalRecordings === undefined || user.tourCompletedAt === undefined) return;` (wait for `/me` hydration), and/or add `totalRecordings` + `tourCompletedAt` to the mobile-login `select` so the initial user is complete. Belt-and-suspenders: gate the auto-fire behind a "hydrated from /me" flag rather than the partial login user. (Do not rely on the AsyncStorage marker as the primary guard — it resets on reinstall by design.)

---

## Issue 2 — Login screen: keyboard covers the password field, no scroll to recover

**Symptom:** on `sign-in`, the on-screen keyboard covers the password field and the screen can't scroll to lift the focused field above the keyboard.

### Root cause — the sign-in screen has **no** keyboard avoidance / scroll container, and this is **deliberate** (OAuth-stability regression history).

`app/(auth)/sign-in.tsx` render tree: `SafeAreaView > View className="flex-1 justify-center" > …TextInputs (email, password)`. **No `KeyboardAvoidingView`, no `ScrollView`, no `KeyboardAwareScreen`.** The file documents why (lines ~227–240 + the AUTH-CRITICAL header):

> "Sign-in screen intentionally does NOT use KeyboardAwareScreen. … the parent ScrollView destabilized the auth-session promise" — commit f4297d1 (KeyboardAwareScreen wrapper, OTA 2026-04-28) **broke mobile Google/Apple OAuth**: the parent `ScrollView` re-layout dismissed the `SFAuthenticationSession` modal and `promptAsync()` returned `cancelled`. Reverted in `0149c6f`. The screen was left unwrapped on the assumption it's "short enough" that the password field stays visible — which on-device testing disproves.

### Is this the same root cause as PR #26 (transcript-edit keyboard fix)?

**Separate gap, same problem class.** PR #26 fixed `app/entry/[id].tsx` (a bare `ScrollView` that needed `automaticallyAdjustKeyboardInsets` + `keyboardShouldPersistTaps`). That change **does not touch** `sign-in.tsx`. The class is identical ("input can sit under the keyboard with no recovery"), but this instance is a **deliberately-unwrapped AUTH-CRITICAL screen** — a naive `KeyboardAvoidingView`/`ScrollView` wrap risks **re-introducing the reverted OAuth regression**, so it can't reuse PR #26's approach or the shared `KeyboardAwareScreen`.

**File / code path:** `app/(auth)/sign-in.tsx` (render tree; the `View flex-1 justify-center` wrapper).

---

### PROPOSAL (not implemented — proposal only, 2026-07-02)

#### 1. The fix approach, and why it avoids the f4297d1 failure mode

**Recommended (Option A): a padding-only `KeyboardAvoidingView` scoped to the email/password form *only* — never a `ScrollView`, and never wrapping the OAuth buttons.**

Structure today (top → bottom): `SafeAreaView > View flex-1 justify-center >` **[ Google button, Apple button, "or" divider ]** then **[ email `TextInput`, password `TextInput`, Sign-in button ]**. The keyboard is only ever raised by focusing the email/password inputs — which sit **below** the OAuth buttons.

The proposed change: wrap **just the email→sign-in-button block** in:
```
<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
  … email / password / submit …
</KeyboardAvoidingView>
```
Leave the OAuth buttons, the divider, and the `SafeAreaView`/outer `View` exactly as they are.

**Why this cannot reproduce f4297d1:** the reverted regression was caused by a `KeyboardAwareScreen` that wrapped the **entire** screen in a **`ScrollView`**. When the native `SFAuthenticationSession`/`ASWebAuthenticationSession` sheet opened for Google/Apple, that ancestor `ScrollView` re-laid-out (content-size/scroll recalculation) and that re-layout tore down the auth-session presentation, so `promptAsync()` resolved `cancelled`. The proposed fix differs on the two properties that caused the failure:
- **No `ScrollView` anywhere** — a `KeyboardAvoidingView` with `behavior="padding"` adjusts bottom padding; it does not create a scroll container, so there is no scroll re-layout to interfere with the auth sheet.
- **The OAuth buttons are outside the wrapper** — their subtree is byte-for-byte unchanged, so nothing in the OAuth render path re-parents or re-measures when the sheet opens. Additionally, `KeyboardAvoidingView` only reacts to **keyboard-frame** events, and no keyboard is up during an OAuth tap (the tap dismisses focus and opens a native sheet) — so the wrapper is inert during the exact window that regressed.

**Ultra-conservative alternative (Option B), if any OAuth flakiness is seen in testing:** keep the view tree **structurally identical** (no new wrapper at all) and instead listen to `Keyboard.addListener("keyboardWillShow/Hide")` and apply an `Animated`/`translateY` (or a bottom `paddingBottom`) to the existing centered `View` only while a text field is focused. Zero structural change to the OAuth subtree = zero chance of the f4297d1 mechanism. More code than Option A; use only if Option A shows any regression.

**Do NOT** reuse the shared `KeyboardAwareScreen` (it is the reverted ScrollView approach) or PR #26's `automaticallyAdjustKeyboardInsets` (that prop lives on a `ScrollView`, which this screen must not gain).

#### 2. Required OAuth re-test (`docs/AUTH_HARDENING.md`) + OTA vs full build

`sign-in.tsx` carries the `// AUTH-CRITICAL FILE` header, so **any** change to its render tree triggers the full manual checklist **before** shipping — no exceptions. Required runs:

- **Web** (incognito, `getacuity.io/auth/signin`) — even though this is a mobile-only change, the checklist is run whole: Continue with Google → `/home`; Continue with Apple → `/home`; email+password → `/home`; no 500s on `/api/auth/callback/*` or `/signin/*`. *(Web is unaffected by this file, but the checklist is defined as all-or-nothing.)*
- **Mobile (real device, TestFlight/internal)** — the load-bearing runs for this change:
  1. Sign out, force-quit, reopen → sign-in screen.
  2. **Continue with Google** → Google sheet → returns to app on `/home`. **(primary regression guard)**
  3. **Continue with Apple** → Apple sheet → returns on `/home`; `appleSubject` populated. **(primary regression guard)**
  4. Email + password → `/home`, **with the keyboard-overlap fix confirmed** (password field visible above the keyboard).
  5. "Email me a sign-in link" → email → deep link opens + signs in.
- **Smoke test:** `GET /api/internal/auth-smoke-test?token=…` returns `{ ok: true, results: { env, schema, google, apple, credentials all true } }`. (This is provider/env/schema health — it won't catch a client-side sheet-dismiss regression, so it's necessary but **not sufficient**; the on-device Google/Apple taps in steps 2–3 are the real guard.)

**OTA-updatable?** **Yes — JS-only.** `KeyboardAvoidingView`, `Keyboard`, and `Animated` are all React Native core (already in the vc24 binary); no new native module, no `app.json`/pod/gradle change. So the fix ships via **EAS Update (OTA)** on top of the existing build — no store submission or `eas build` required. **Caveat:** because it's AUTH-CRITICAL, the mobile manual checklist above must be run **on a real device against the OTA/preview channel before promoting the OTA to production** — an OTA reaches users instantly, so a bad one has the same blast radius as a bad build.

#### 3. Risk level + verification checklist

**Risk: MEDIUM.** Low code complexity, but maximum-stakes surface (the exact file/mechanism that regressed twice — 2026-04-27 and 2026-04-28) and OTA delivery = instant fleet-wide reach. Option A's blast radius is contained (OAuth subtree untouched), which is what keeps it out of HIGH.

Pre-ship checklist:
- [ ] Diff wraps **only** the email/password form; OAuth buttons + outer `View`/`SafeAreaView` unchanged; **no `ScrollView` introduced**.
- [ ] `AUTH_HARDENING.md` mobile checklist passes on a **real iPhone** — especially **Google** and **Apple** returning to `/home` (steps 2–3).
- [ ] Password-overlap fixed: on a small device (SE/13-mini) the focused password field sits above the keyboard; the Sign-in button is reachable.
- [ ] iPad + a tall device (Pro Max) — no oversized gap / clipping.
- [ ] Android: email/password still usable (Android resizes natively; `behavior` is `undefined` there).
- [ ] `auth-smoke-test` → `ok: true`.
- [ ] Ship as its **own** PR (separate from the tour fixes), reviewed against `AUTH_HARDENING.md`, OTA promoted to prod only after the on-device Google/Apple passes.

---

## Issue 3 — Tour step 1/7 ("Record — long-press the mic") spotlight lands on the goal card mid-screen, not the mic FAB

**Symptom:** step 1 of 7 (0-indexed step 0, "Record — long-press the mic…") — the spotlight cutout is over the mid-screen goal card, not the bottom-center mic FAB.

### Root cause — the mic step's target is **mis-measured**; the goal card is incidental (nothing targets it).

- Steps attach **by index** (`components/tour/steps.ts`; `TOUR_STEP_INDEX.mic = 0`). The mic target lives in `app/(tabs)/_layout.tsx` as `<AttachStep index={TOUR_STEP_INDEX.mic}>` wrapping the **raised** mic button with an **absolutely-positioned, percentage-based** wrapper:
  ```
  style={{ position: "absolute", left: "50%", top: -36, marginLeft: -32, width: 64, height: 64, zIndex: 10 }}
  ```
  spotlight-tour measures this wrapper via `measureInWindow`.
- **No element anywhere carries an `AttachStep` on the goal card** (grep of `AttachStep`/`TOUR_STEP_INDEX.` across `app`+`components`: only mic + tab items + dashboard `fill` + settings gear). So the spotlight is **not targeting** the goal card — step 0's cutout is **mis-measured and lands mid-screen**, where the goal card happens to be.
- **Timing amplifier:** the tour opens on Home with `lastPathRef` seeded to `HOME_PATH`. Step 0's `before` computes `path = TOUR_STEP_PATHS[0] = HOME_PATH === lastPathRef` → it **skips the `NAV_SETTLE_MS` (450 ms) settle delay** (`TourProvider.tsx`). So the mic wrapper is measured **immediately** on tour start.
- The mic wrapper is uniquely fragile: `position: absolute` + **`left: "50%"`** (percentage) + negative `top: -36`. `measureInWindow` on a percentage-positioned absolute view under the New Architecture can return an incorrect/stale rect when measured before layout fully resolves — the same target already bit us once (the in-file "Build-68 bug: AttachStep wrapped the absolutely-positioned button, so the in-flow 0×0 wrapper measured the wrong rect" note). The current code moved positioning onto the wrapper, but the percentage-left + no-settle combination still yields a wrong frame on vc24.

### Does it affect other steps?

**Likely step 0 only.** Every other target is an **in-flow** element measured **after** a nav settle:
- dashboard (index 1) → `app/(tabs)/index.tsx:268` `<AttachStep index={dashboard} fill>` on the home header (already laid out).
- tab items (entries/tasks/insights/goals, indices 2–5) → `_layout.tsx:274` `<AttachStep … fill style={{ flex: 1 }}>` — normal flex layout.
- settings (index 6) → `components/home/identity-hero.tsx:106` on the header gear.
Their `before` navigates to a different tab → incurs the 450 ms settle before measuring, and none use absolute/percentage positioning. The **mic (step 0)** is the only target that is both absolutely-/percentage-positioned **and** measured with no settle delay (same screen as the tour's opening path) — so the misalignment is specific to it. Consistent with only "step 1/7" being reported wrong.

**Files / code path:** `app/(tabs)/_layout.tsx` (mic `AttachStep` wrapper, `left: "50%"`, `top: -36`) · `components/tour/TourProvider.tsx` (`NAV_SETTLE_MS`, same-screen `before` skips settle for step 0) · `components/tour/steps.ts` (index map).

**Proposed fix approach (not implemented):** make the mic target measurable deterministically — e.g. (a) replace `left: "50%"` + `marginLeft` with a screen-width-derived numeric left (or center the 64×64 button via the tab bar's flex layout so the AttachStep wraps an in-flow, non-percentage element); and/or (b) force a settle/re-measure for step 0 even on the same screen (don't skip the delay when `i === TOUR_STEP_INDEX.mic`), or use an `onLayout`-captured frame. Verify the cutout lands on the FAB on 2–3 device heights + tablet.

---

## Summary

| # | Bug | Root cause | Primary file |
|---|---|---|---|
| 1 | Tour fires for existing user on fresh install | Gate fails open on `undefined` server fields (not in mobile-login response) + local marker wiped on reinstall | `hooks/use-tour-trigger.ts` (+ `mobile-login` select, `auth-context`) |
| 2 | Keyboard covers password, no scroll | Sign-in deliberately has no KAV/scroll (reverted due to OAuth regression) — separate from PR #26 | `app/(auth)/sign-in.tsx` |
| 3 | Step-0 spotlight on goal card, not mic | Mic `AttachStep` wrapper (absolute + `left:"50%"`) mis-measured; step 0 skips the settle delay; goal card incidental | `app/(tabs)/_layout.tsx` (+ `TourProvider`) |

All three are diagnosis-only; no code changed.
