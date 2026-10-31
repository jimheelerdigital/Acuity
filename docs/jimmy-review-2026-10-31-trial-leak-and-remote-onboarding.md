# For Jimmy: trial leak fix + server-controlled app onboarding (2026-10-31)

Requested by Keenan. Two changes, both committed on `main` but **not pushed**. Both touch the signup and payment path, so they wait for your review. Nothing below is live until it's pushed, and the app part also needs one OTA.

---

## 1. Fix A: web funnel signups no longer keep a no-card trial

### What was wrong
`bootstrapNewUser` gives every new account `subscriptionStatus: "TRIAL"` with `trialEndsAt = +7 days` and no card. The web funnels are supposed to drop new accounts to FREE straight away (the 7-day Pro trial there needs a card through Stripe Checkout). The funnel did that **only with a browser fetch** to `/api/onboarding/funnel-free-plan`, fired after `signIn()`.

That fetch failed silently for **3 of the last ~160** funnel signups. Those accounts kept the no-card TRIAL, so closing checkout still unlocked the app for a week. Example: lauradoestaxes78@ (10-30) opened checkout, closed it, signed into the app from the win-back email, and has 3 debriefs with full Pro access.

Funnel signups in the last 14 days, by status | `funnel_account_created` value:
- FREE | email-gate, signin ok: 145 (worked)
- TRIAL | email-gate, signin ok: 3 (the leak)
- PRO/TRIAL + Stripe: 16 (paid card trials, fine)

### What changed
- **New `apps/web/src/lib/funnel-free-plan.ts`**
  - `isWebFunnelPath(path)`: `/start`, `/start-bwk`, `/start-test`, `/start-test-bwk`, any later `/start-*`.
  - `moveNewFunnelAccountToFree(userId)`: the exact same narrow `updateMany` the route used before. Created < 60 min ago, still TRIAL, no `stripeSubscriptionId`, `NOT_IAP_SOURCE_WHERE`. Sets FREE + `trialEndsAt = now`. `trialExpiredAt` stays null, so no "trial ended" emails or pushes.
- **`apps/web/src/app/api/auth/signup/route.ts`**: after `bootstrapNewUser`, calls `moveNewFunnelAccountToFree(userId)` when the **client's** `attribution.landingPath` is a funnel path. It uses the client path, not the first-touch cookie, so a later plain `/signup` isn't caught by it. Failures are logged and swallowed.
- **`apps/web/src/app/api/onboarding/funnel-free-plan/route.ts`**: now a thin wrapper over the same helper. The browser call stays as a backstop, and Google OAuth funnel signups still rely on it.
- **`apps/web/src/app/api/admin/users/route.ts`**: the leftover TRIAL label is now **"Trial, no card — Nd left"**, so it can't be mistaken for a paid trial. Pill colour unchanged.
- Tests: `apps/web/src/lib/funnel-free-plan.test.ts`.

### Deliberately not changed
- **Existing no-card TRIAL accounts keep their trial** (Keenan's call). No backfill.
- **App signups still get the no-card TRIAL in the DB.** In practice the app's routing already holds them at the paywall (`decideColdStartRoute` → `v10-paywall` when not PRO). **Question for you:** should app signups start FREE too? It would make the DB tell the truth (the admin shows 19 "Trial, no card" app accounts in 14 days). The risk is any app UI that keys off TRIAL (trial banners, countdowns). Your call.
- **Google OAuth funnel signups** still depend on the browser call (bootstrap runs inside NextAuth `events.createUser`, where we can't tell a funnel signup apart). Same as before.

### Please check
- [ ] Email funnel signup on preview: account is FREE before paying, PRO after the Stripe card trial.
- [ ] A plain `/signup` account still gets its normal trial.

---

## 2. Feature B: server-controlled app onboarding (no app update to change it)

Keenan's ask: "change the onboarding funnel directly within our app WITHOUT ever having to do an app update." This is phase 1: **text, screen order and A/B variants** for the live v11 onboarding plus the paywall's words. Phase 2 (below) is drawing whole question screens from the server.

### How it works
1. Keenan edits **goripple.io/admin/app-onboarding**: per-screen text fields (empty = keep the app's words), screen order (move up/down, hide), paywall words, and up to 6 variants with weights.
2. Saved to the new `RemoteConfig` table (key `app-onboarding`) through `POST /api/admin/app-onboarding` (requireAdmin).
3. The app calls `GET /api/app/onboarding-config?installId=…` on the start screen. It gets back `{ variant, overrides }`, sticky per install (FNV hash of the install id, by weight).
4. The app **writes the overrides into the copy objects the screens already import** (`lib/onboarding-v11/copy.ts`) and the screen order (`flow.ts`), then locks once the first question opens. So no screen changes were needed except the paywall.
5. The variant id goes through the existing `setV10Assignment()`, so every v10 event carries `experiment: <variant>`. That gives results per variant with no new plumbing.

### Safety
- **Shape and validation live in one place:** `packages/shared/src/app-onboarding.ts`, used by both web and mobile. Unknown keys are dropped, strings trimmed and capped, option **ids can't change** (labels only), and screen types can't be added.
- **Order rules:** `name` is required, `consent` is always last, duplicates are removed. A bad order falls back to the default.
- **Failure handling:** a fetch timeout (2.5s), an error or a garbage response leaves the bundled words in place. The last good response is cached in AsyncStorage (`ripple.onboarding_remote_v1`) for the next launch.
- **The endpoint returns control on any server error.** It's public because it runs before an account exists, and it only returns marketing copy.
- **Prices and trial length always come from the store.** The paywall text supports `{days}` and `{name}` placeholders. `trustLine` is optional: it renders above the CTA only when set.
- **With nothing saved, the app behaves exactly as today.** Variant "control" has empty overrides.

### Files
**Shared**
- `packages/shared/src/app-onboarding.ts` (new; exported from `index.ts`): types, `sanitizeOverrides`, `sanitizeOrder`, `sanitizeRemoteConfig`, `pickOnboardingVariant`, `fillOnboardingTemplate`.

**Schema**
- `RemoteConfig { key @id, value Json, updatedAt, updatedBy }`, RLS enabled, added to `rls-allowlist.txt`.
- **The table already exists in prod.** I created it with the exact DDL Prisma generates (raw SQL), because another session has uncommitted `CreatorPost` columns in the working schema and a `db push` would have pushed those too. `prisma migrate diff` now shows no difference for `RemoteConfig`.

**Web**
- `apps/web/src/lib/remote-onboarding.ts`: read/save, plus `APP_ONBOARDING_DEFAULTS`, a display-only snapshot of the app's words used as admin placeholders. **If the app copy changes, update this too.**
- `apps/web/src/app/api/app/onboarding-config/route.ts`
- `apps/web/src/app/api/admin/app-onboarding/route.ts`
- `apps/web/src/app/admin/app-onboarding/page.tsx` + `editor.tsx`
- Tests: `apps/web/src/lib/remote-onboarding.test.ts`. These cover sanitizing, order rules, duplicate ids, a sticky ~50/50 split, paused variants and templates.

**Mobile**
- `lib/onboarding-v11/remote.ts` (new): `prepareRemoteOnboarding()`, `applyOnboardingOverrides()`, `lockRemoteOnboarding()`. It resets to the bundled words before each apply, so switching variants never leaves stale text.
- `lib/onboarding-v11/flow.ts`: `activeOrder` + `setV11Order()`. `goNext` and `firstQuestionHref` use it. A screen missing from the active order (a stale route) continues to the next active one.
- `lib/onboarding-v11/copy.ts`: new `PAYWALL` object (the paywall's words that used to be inline).
- `app/onboarding-new/_v10/start.tsx`: calls `prepareRemoteOnboarding()` on mount; "I'm new" locks the words and goes to `firstQuestionHref()`, which used to be hardcoded to `/hook`.
- `app/onboarding-new/_v10/paywall.tsx`: badge, title, sub line, features heading and CTA now come from `PAYWALL` via `fillOnboardingTemplate`, plus the optional `trustLine`. Same layout.
- `app/_layout.tsx`: the `v10-resume` case uses `firstQuestionHref()` instead of `/hook`.

### Please check on a device
- [ ] With nothing saved: onboarding and paywall look and read exactly as today, including the badge with and without a name.
- [ ] Save a variant in admin (change the hook question, hide "sound", add a trust line). Fresh install: changes show; the order skips "sound"; the trust line sits above the button.
- [ ] Airplane mode on a fresh install: bundled words, no hang on the start screen.
- [ ] Two variants at 50/50 across several fresh installs: both appear, and events carry `experiment: <id>`.
- [ ] `tsc`: the only error in the touched files is the pre-existing `react-native-keyboard-controller` import in `_layout.tsx` (module not installed on Keenan's Mac).
- [ ] No mobile unit test runner is set up, so `applyOnboardingOverrides` is untested beyond types. Worth a device pass on the reset logic.

### Known gaps
- **The `v10-resume` relaunch path** (signed in, no debrief yet) doesn't call `prepareRemoteOnboarding`, so it uses the default order and words unless they were applied earlier in the same app session. That path is rare. Fixing it means calling prepare in `_layout` before the redirect, but I didn't want an extra await in AuthGate.
- **The paywall FAQ, reviews and Pro features list are still bundled.** Easy to add the same way.
- **Remote config doesn't touch prices or offerings.** For price and offer tests in the app, use **RevenueCat Experiments** (offerings), which needs no release.

### To ship
1. Review, then push `main` (deploys web, admin and API).
2. OTA the app: `cd apps/mobile && npm run ota -- --message "Server-controlled onboarding words and order"`. **Use the script, never `eas update`** (see CLAUDE.md, update b00c20d6).
3. Keenan's rule is that funnel changes go live on Mondays. With nothing saved it's a no-op, so the OTA can go out any day; Keenan saves his first variant on a Monday.

---

## Phase 2 (proposed, ~1–2 weeks): whole question screens from the server
- The app renders a **list of screens from the server** using the same screen types the web funnel already has (`apps/web/src/lib/funnel-v9-config.ts`: statement yes/no, single, multi, slider, chips, info, loader). Keenan can add, remove and reorder questions, not only edit words.
- One config format for web and app, so a funnel like the new "planners failed you" one runs on both, with the same A/B variants.
- Needs a generic renderer in the app (new screen components, shipped once via OTA or 1.9.1). After that, no release is needed for anything inside those screen types.
- Also worth deciding: **Superwall vs RevenueCat Paywalls** for remote paywall layouts. Phase 1 covers words only.

## Other asks from Keenan's growth plan (for 1.9.1)
- Meta app events for trials and purchases (app trials are invisible to Meta today).
- Push token registration (the paywall promises a reminder; only email works today).
- Account-first onboarding, with the first debrief turning into a list on screen straight away.
- A paywall exit offer when the Apple sheet is cancelled (`v10_purchase_cancelled`): yearly only, 25–33% off, once. Waiting on Keenan's yes.
