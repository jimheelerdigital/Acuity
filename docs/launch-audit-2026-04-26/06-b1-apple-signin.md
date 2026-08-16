# B1 — Sign in with Apple (mobile)

**Status:** spec only — not implemented yet.
**Owner:** Jim (mobile + ASC config) | Claude (code, when given the go-ahead)
**Estimate:** 1.5–2.5 days end-to-end (1 day code + 0.5 day Apple-portal config + 0.5 day device testing). Real blocker is your turnaround on the Apple Developer portal; the code is straightforward.

## Why this is mandatory

App Store Review Guideline **4.8**: any app that offers a third-party sign-in option (we have Google) must also offer Sign in with Apple as an equivalent option. We currently offer Google → hard reject without this.

## Architecture choice

There are two sane integration paths:

**Path A — `expo-apple-authentication` + native flow → server callback (recommended).**
Mirrors the existing Google flow. The mobile app calls `AppleAuthentication.signInAsync()`, gets back an Apple identity token + authorization code, and POSTs it to a new `/api/auth/mobile-callback-apple` route that mirrors `mobile-callback`. Server verifies the token, finds-or-creates the user, issues the same NextAuth-encoded session JWT we already use.

**Path B — NextAuth's Apple provider (web only).**
Adds Apple-on-web for free but doesn't satisfy the App Store requirement. Not the right path on its own; could be a follow-up after mobile lands.

**Going with Path A. Path B added in passing only if low-effort.**

---

## File-by-file changes

### Mobile (`apps/mobile/`)

**New file: `apps/mobile/lib/apple-auth.ts`**
- Exports `signInWithApple(): Promise<{ user: User; sessionToken: string }>` mirroring the Google helper in `lib/auth.ts`.
- Calls `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })`.
- POSTs `{ identityToken, authorizationCode, fullName, email, user }` to `/api/auth/mobile-callback-apple`.
- Returns same shape as Google flow so call-site can be uniform.
- Handles the **"first sign-in only returns name + email"** Apple quirk by stashing them in `expo-secure-store` keyed on Apple's stable `user` ID, and re-using stashed values on subsequent sign-ins.

**Edit: `apps/mobile/contexts/auth-context.tsx`**
- Add `signInWithApple` to the context value, wired to the helper above.
- Same shape as existing `signInWithGoogle` so consumers are symmetric.

**Edit: `apps/mobile/app/(auth)/sign-in.tsx`**
- Add an `<AppleAuthentication.AppleAuthenticationButton>` above the Google button.
- iOS only — wrap in `Platform.OS === "ios" && AppleAuthentication.isAvailableAsync()` check; on Android the button is hidden.
- Match Google button's vertical rhythm + style.
- Same loading + error UX as Google.
- Replicate on `apps/mobile/app/(auth)/sign-up.tsx` if it exists separately.

**Edit: `apps/mobile/app.json`**
- Add `"usesAppleSignIn": true` under `ios.infoPlist` (Expo SDK 54 picks this up and writes the entitlement automatically).
- Add `"expo-apple-authentication"` to the `plugins` array if the project's prebuild needs it (verify after first EAS build whether this is required — Expo often handles it via the package's `app.plugin.js`).

**Edit: `apps/mobile/ios/Acuity/Acuity.entitlements`** (currently empty)
- After EAS build runs the prebuild, this file should contain:
  ```xml
  <key>com.apple.developer.applesignin</key>
  <array><string>Default</string></array>
  ```
  EAS auto-generates this from `usesAppleSignIn: true`. **Verify post-build.** If absent, file is the manual fallback.

### Web (`apps/web/`)

**New route: `apps/web/src/app/api/auth/mobile-callback-apple/route.ts`**
- Mirror of `mobile-callback/route.ts`.
- Body: `{ identityToken: string, authorizationCode?: string, fullName?: { givenName, familyName }, email?: string, appleUserId: string }`.
- Verifies `identityToken` via Apple's JWKS endpoint (`https://appleid.apple.com/auth/keys`) — must check `iss === "https://appleid.apple.com"`, `aud === "com.heelerdigital.acuity"`, `nbf`/`exp` valid.
- Use `jose` (already in our tree via NextAuth) to verify; **do not import `apple-signin-auth`** (extra dep).
- Find-or-create user by email. **Apple privacy quirk**: `email` may be `null` on subsequent sign-ins or a relay address (`@privaterelay.appleid.com`). Use the stable `appleUserId` (sub claim) as the lookup key instead — store it on a new `User.appleSubject` column.
- Auto-link if the user already exists with the same email (e.g., user signed up via Google with the same address).
- Issue mobile session token via existing `issueMobileSessionToken()` helper. Same 30-day maxAge as Google + email/password.
- Wire `bootstrapNewUser` for first-time creation (trial clock + Life Matrix + UserMemory + `trial_started` PostHog event), same as Google flow.
- Rate-limit via existing `limiters.auth` (5/15min IP).

**Schema: `prisma/schema.prisma`**
- Add `appleSubject String? @unique` to `User`. Nullable (only set on Apple-signed-in users); unique because Apple's `sub` claim is the stable account identifier.
- **Manual step:** `npx prisma db push --schema=prisma/schema.prisma` from your home network. Required before the route can find-or-create users by Apple subject.

**Edit (optional): `apps/web/src/lib/auth.ts`**
- Add `AppleProvider` to the NextAuth providers array for web Apple sign-in. Lower priority than the mobile path but cheap. Skip if it adds friction.
  ```ts
  AppleProvider({
    clientId: process.env.APPLE_CLIENT_ID!,
    clientSecret: process.env.APPLE_CLIENT_SECRET!,
  })
  ```
  `clientSecret` for web is a **JWT generated from your Apple key** (not a string). Helper at `lib/apple-client-secret.ts` to mint it on demand. Defer if it's not needed for App Store compliance (it's not — only mobile is required).

### Test seam

- **Mock the Apple JWKS verification** in unit tests via a `verifyAppleIdToken` injection point so we can test the find-or-create logic without hitting Apple in CI.
- Snapshot-test the route's response shape against the mobile-callback Google equivalent so divergence shows up.

---

## New dependencies

### Mobile
- `expo-apple-authentication` — official Expo wrapper for `AuthenticationServices.framework`. Version pinned to whatever Expo SDK 54 shipped with (`~7.0.x` based on SDK 54 catalog).

### Web
- `jose` — already a transitive dep via NextAuth. **No new install.** Use it directly to verify the Apple JWKS.
- (Optional) `next-auth/providers/apple` — already in the NextAuth bundle, no install needed.

### Schema
- One new column. No new package.

---

## Native config changes summary

| File | Change |
|---|---|
| `apps/mobile/app.json` | `ios.infoPlist.usesAppleSignIn: true` |
| `apps/mobile/app.json` | Add `expo-apple-authentication` to `plugins` array (only if prebuild requires) |
| `apps/mobile/ios/Acuity/Acuity.entitlements` | Verify EAS-generated `com.apple.developer.applesignin = ["Default"]` |

No `Info.plist` keys beyond what `usesAppleSignIn` triggers.

---

## Backend changes

| Surface | Change |
|---|---|
| `prisma/schema.prisma` | `User.appleSubject String? @unique` |
| `apps/web/src/app/api/auth/mobile-callback-apple/route.ts` | New route — JWKS verify, find-or-create by `appleSubject`, issue session JWT |
| `apps/web/src/lib/apple-jwks.ts` | New helper — fetch + cache Apple's JWKS, verify ID token via `jose.jwtVerify` |
| `apps/web/src/lib/bootstrap-user.ts` | No change (already idempotent for new user creation) |
| `apps/web/src/lib/rate-limit.ts` | No change (reuse `limiters.auth`) |

**Database migration:** `npx prisma db push` from home network (work network blocks Supabase pooler — you've hit this before).

**Existing user account-linking:** when an Apple sign-in arrives and we find an existing user by **canonical email**, attach the `appleSubject` to that row so future Apple sign-ins land on the same account. This avoids creating duplicate accounts for users who signed up with Google and now sign in with Apple.

---

## Apple Developer portal setup (you do this in developer.apple.com)

In order:

1. **Sign in to https://developer.apple.com/account/resources/identifiers/list**
2. **Update App ID `com.heelerdigital.acuity`**:
   - Capabilities → enable **Sign In with Apple** → Edit → choose "Enable as a primary App ID" (no group needed for one app).
   - Save. This re-issues your provisioning profile; EAS will pick it up on next build via auto-managed credentials.
3. **(Web Apple sign-in only — skip if mobile-only path):**
   - Create a **Services ID** (for web): identifier `com.heelerdigital.acuity.web`. Configure → Sign In with Apple → Domain: `getacuity.io`, Return URLs: `https://www.getacuity.io/api/auth/callback/apple`.
   - Create a **Key**: enable "Sign In with Apple", download the `.p8` private key (one-time download — store securely). Note the Key ID + Team ID.
   - Add env vars to Vercel:
     ```
     APPLE_CLIENT_ID=com.heelerdigital.acuity.web
     APPLE_TEAM_ID=<your team id>
     APPLE_KEY_ID=<key id from above>
     APPLE_PRIVATE_KEY=<contents of .p8 — multi-line, escape newlines or store via Vercel UI as multi-line>
     ```
4. **Verify EAS managed credentials picked up the new entitlement:**
   ```
   cd apps/mobile && eas credentials -p ios
   ```
   If the provisioning profile shows "Sign In with Apple" in capabilities, you're good. Otherwise: `eas credentials -p ios --clear-credentials` and let EAS re-provision on the next build.

**Time:** 30–45 minutes once you're in the portal. Apple changes propagate near-instantly.

---

## Testing plan

| # | Test | Where |
|---|---|---|
| 1 | First-ever Apple sign-in shows full name in profile | iOS device |
| 2 | Same Apple ID re-signing in renders the user's name from the cached `expo-secure-store` value (Apple doesn't return name on subsequent sign-ins) | iOS device |
| 3 | Apple sign-in for a brand-new email creates a `User` row + seeds Life Matrix + fires `trial_started` event | iOS device + PostHog |
| 4 | Apple sign-in for an email that already has a Google-linked account attaches `appleSubject` to the SAME row, no duplicate account | seed account + iOS device |
| 5 | Apple sign-in with `@privaterelay.appleid.com` relay email completes successfully + the relay address is the canonical email on the User row | iOS device with private-relay enabled |
| 6 | Sign out → Apple sign-in again resumes session correctly | iOS device |
| 7 | Account deletion (B2) clears `appleSubject` so a re-signup with the same Apple ID lands the reduced 3-day trial via the `DeletedUser` tombstone | iOS device |
| 8 | Web `/auth/signin` Apple button works (only if Path B included) | Browser |
| 9 | Subsequent sign-ins after a server-side `appleSubject` collision (shouldn't happen but test anyway) return a clean 409 | curl direct against the route |
| 10 | Rate limiter still fires (5/15min/IP) when a script hammers the mobile-callback-apple route | curl loop |

**Manual TestFlight build required to test 1-7.** Local Expo Go cannot do real Apple sign-in (Apple requires a signed device build).

---

## Estimated time breakdown

| Task | Time |
|---|---|
| Schema change + `prisma db push` (you, home network) | 10 min |
| `apps/web/src/lib/apple-jwks.ts` + JWKS verify helper | 1 hr |
| `mobile-callback-apple/route.ts` (mirror existing Google route) | 1.5 hr |
| `apps/mobile/lib/apple-auth.ts` + secure-store stash | 1.5 hr |
| `apps/mobile/contexts/auth-context.tsx` + `(auth)/sign-in.tsx` UI | 1 hr |
| Apple Developer portal config (you) | 45 min |
| EAS dev build + push to TestFlight | 30 min |
| Manual device testing (10 cases above) | 2 hr |
| Bug-fix iteration + edge cases | 2 hr |
| Web Apple provider (Path B, optional) | 2 hr |
| **Total — Path A only** | **~10 hr / ~1.5 days focused** |
| **Total — Path A + B** | **~12 hr / ~1.5–2 days focused** |
| **Wall clock with overhead** | **2–3 days end-to-end** |

The wall-clock estimate assumes one back-and-forth with Apple's reviewer if anything subtle bites; the active-coding estimate is the lower bound.

---

## Risks / unknowns

- **Apple's JWKS rotation cadence is undocumented.** Cache for 24h max; refetch on signature verification failure before throwing.
- **Private-relay email address handling.** Already present in the schema (we treat email as canonical-strippable per the plus-addressing fix), but verify the trial-tombstone lookup still finds the right row when an Apple user deletes their account and re-signs up via a *different* private-relay address. This is the trial-farming attack vector for Apple users — same threat as Gmail+addressing.
- **EAS build credentials race.** If you've ever manually edited the provisioning profile, EAS auto-manage may collide. Run `eas credentials -p ios` once before the first Apple-enabled build to verify clean state.
- **Existing user link collision.** If a user has both a Google account AND an Apple ID with different emails, Apple sign-in creates a new account by design (we can't know they're the same person). Document this — not a bug, expected behavior.
