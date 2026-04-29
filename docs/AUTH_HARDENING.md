# Auth Hardening

Authentication is the highest-stakes surface in this app. A single bad commit can lock every user out, including reviewers, including paying subscribers. This document is the standing rule set for protecting it.

If you're reading this because you're about to change auth, **read it all** before you commit.

## Files marked AUTH-CRITICAL

These files carry an `// AUTH-CRITICAL FILE` block at the top. Any change to them — including indirect changes to their render tree, imports, or environment — requires the manual verification checklist below before merging.

- `apps/web/src/lib/auth.ts` — NextAuth config (providers, callbacks, events, adapter)
- `apps/web/src/app/auth/signin/page.tsx` — web sign-in UI
- `apps/web/src/lib/bootstrap-user.ts` — first-touch user bootstrap (called by web events.createUser AND mobile-callback)
- `apps/mobile/app/(auth)/sign-in.tsx` — mobile sign-in UI
- `apps/mobile/lib/auth.ts` — mobile Google flow, mobile-callback POST, session storage
- `apps/mobile/lib/apple-auth.ts` — mobile Apple sign-in flow
- `apps/web/src/app/api/auth/mobile-callback/route.ts` — Google mobile JWT exchange
- `apps/web/src/app/api/auth/mobile-callback-apple/route.ts` — Apple mobile JWT exchange

## The manual verification checklist

Run this BEFORE every production deploy or OTA that touches an AUTH-CRITICAL file. No exceptions.

**Web (https://www.getacuity.io):**
1. Open in incognito. Visit `/auth/signin`.
2. Click "Continue with Google" → completes auth → lands on `/home` with the user's data.
3. Click "Continue with Apple" → same.
4. Sign in with email + password (use a known test account) → same.
5. Open the network tab during each. Confirm no 500s on `/api/auth/callback/*` or `/api/auth/signin/*`.

**Mobile (TestFlight, real device):**
1. Sign out if signed in. Force-quit the app.
2. Open the app → sign-in screen.
3. Tap "Continue with Google" → Google sheet → returns to app on `/home`.
4. Tap "Continue with Apple" → Apple sheet → returns to app on `/home`. Verify the appleSubject column on the User row was populated.
5. Sign in with email + password → same.
6. Tap "Email me a sign-in link" → email arrives → tap link → app opens and signs in via deep link.

If any one of those fails, **do not deploy.**

## Smoke test — `/api/internal/auth-smoke-test`

Lives at `apps/web/src/app/api/internal/auth-smoke-test/route.ts`. Returns `200 { ok: true, results: {...} }` when every provider's code path is healthy. Returns `500` with an `errors` object on any failure.

**Auth:** requires `Authorization: Bearer <SMOKE_TEST_TOKEN>` or `?token=<...>`. Token is in Vercel env (Production + Preview).

**Manual run:**
```sh
SMOKE=$(grep SMOKE_TEST_TOKEN /tmp/.acuity-env-prod | cut -d= -f2- | tr -d '"')
curl -s "https://www.getacuity.io/api/internal/auth-smoke-test?token=$SMOKE" | jq
```

**Expected output:**
```json
{
  "ok": true,
  "results": {
    "env": true,
    "schema": true,
    "google": true,
    "apple": true,
    "credentials": true
  }
}
```

**What each check actually does (no User/Session/Account writes):**
- `env` — every var the providers need is set + non-empty
- `schema` — `prisma.user.findFirst({})` succeeds. **This is the leading-indicator check for schema-vs-DB column drift** — the exact failure class that broke OAuth on 2026-04-27 and 2026-04-28. If schema declares a column the prod DB doesn't have, this fails before NextAuth's adapter does.
- `google` — `getAuthOptions().providers` includes Google
- `apple` — Apple's published JWKS endpoint is reachable + parseable
- `credentials` — bcrypt round-trips a known password

**Wiring it to alerts:** this is configured outside the repo, in Vercel + Slack:
1. Vercel project → Settings → Deployment Hooks → add `Auth smoke (post-deploy)` calling a tiny worker (Cloudflare or Vercel Function) that hits the smoke endpoint and posts to Slack `#launch-alerts` if `ok` is false.
2. Slack webhook URL stored as `SLACK_LAUNCH_ALERTS_WEBHOOK` on the worker side, NOT in this app.
3. Same worker should fire on a 5-minute cron so we catch silent regressions, not just deploy-time ones.

The worker repo is intentionally separate so a bug in the smoke logic can't break the alerts wiring itself.

## Sentry alerting

All auth-related errors are tagged `auth_route: "true"` so Sentry can filter on them reliably. Currently set in:
- `events.createUser` exception handler (`apps/web/src/lib/auth.ts`)

**TODO: extend coverage.** Future audit pass should ensure every `/api/auth/**` route's catch blocks attach this tag. The Sentry rule lives at:
- Project → Alerts → Rule "Auth route errors → #launch-alerts"
- Filter: `tag.auth_route equals "true"`
- Threshold: 1 event in 5 minutes
- Actions: Slack #launch-alerts + email Jim

## Integration tests (vitest)

Run via `npm run test:auth` from `apps/web`. The auth tests live at `apps/web/src/__tests__/auth/` and mock Prisma + NextAuth so they don't touch a real DB.

**They are deliberately NOT wired into the Vercel build.** A first attempt (commit 7fd52f8) added a `prebuild` vitest gate; the gate itself crashed on an invalid reporter flag and blocked production deploys for two consecutive pushes. Lesson: test-infrastructure failures must not be able to take down deploys, particularly when an emergency fix needs to ship. If the reporter ever changes versions, or vitest itself has a runtime bug, we don't want to sit on a broken deploy path.

Instead, the tests are intended to run from a **post-deploy** hook or a separate CI workflow that can fail loudly without holding production hostage. Failures should page Slack, not block the build.

**Existing coverage:**
- `bootstrap-user-drift.test.ts` — exercises `safeUpdateUserBootstrap` against simulated P2022 errors. Covers the 2026-04-28 regression class.

**TODO (high priority, not yet shipped):**
- `google-oauth-flow.test.ts` — full callback round-trip with mocked Google response
- `apple-oauth-flow.test.ts` — same for Apple
- `credentials-signin.test.ts` — password verification + EmailNotVerified branch
- `mobile-google-callback.test.ts` — `/api/auth/mobile-callback` with mocked Google id_token
- `mobile-apple-callback.test.ts` — `/api/auth/mobile-callback-apple` with mocked Apple identity token + JWKS

This file ships the harness + the most-broken case (`bootstrap-user-drift`); the rest are queued and tracked in `docs/launch-audit-2026-04-26/11-auth-hardening-shipped.md`.

## Past regressions (read these — they keep happening)

### 2026-04-28 — Schema drift on `User.signupUtm*` broke web Google OAuth

Commit `48e9245` declared `signupUtm{Source,Medium,Campaign,Content,Term}` + `signupReferrer` + `signupLandingPath` on User for acquisition funnel work. `prisma db push` was never actually run for those columns despite a misleading "already in sync" message earlier in the day.

PrismaAdapter.createUser succeeded, then bootstrap-user's `prisma.user.update()` threw `P2022: column User.signupUtmSource does not exist`. NextAuth caught the error and surfaced `?error=Callback`; the user got bounced back to `/auth/signin` with no actionable message.

**Fixes:**
- Schema pushed (`prisma db push` from a network that can reach Supabase directly)
- `bootstrap-user.ts` hardened (commit `04b729f`) — `safeUpdateUserBootstrap` catches P2022, parses the missing column from the error message, drops it from the payload, retries

### 2026-04-28 — KeyboardAwareScreen wrapper destabilized Google OAuth on mobile

Commit `f4297d1` wrapped every auth screen in `<KeyboardAvoidingView><ScrollView>`. The mobile Google flow uses `expo-auth-session`'s `promptAsync()` which opens an `SFAuthenticationSession`. The parent ScrollView's re-layout during the modal session caused `promptAsync()` to resolve with `type: "cancel"` instead of `"success"`. `handleGoogle()` silently returns on `cancelled` → user sees a brief Google sheet then bounces back to sign-in with no error.

**Fix:** sign-in.tsx specifically opts out of the wrapper (commit `0149c6f`). Other screens (sign-up, forgot-password, delete-modal, onboarding) keep it.

### 2026-04-27 — Schema drift on `User.targetCadence`

Same pattern as `signupUtm*`. Bit account deletion specifically (Prisma's `delete()` returns the row, RETURNING failed). Workaround: `tx.user.deleteMany()` instead of `delete()` — `deleteMany` doesn't RETURNING.

### 2026-04-24 — Schema drift on `User.isFoundingMember`

Same pattern. Total sign-in outage. Wrapped `events.createUser` bootstrap in try/catch so a future bootstrap failure can't brick OAuth itself.

## How to prevent the next one

1. **Always run `prisma db push` BEFORE deploying a schema change.** If the network blocks Supabase, push from somewhere it doesn't.
2. **`/api/internal/auth-smoke-test` runs after every deploy.** If it goes red in Slack, roll back.
3. **The AUTH-CRITICAL files have a comment block listing past regressions.** Read them.
4. **Don't wrap auth screens in ScrollView.** Specifically `apps/mobile/app/(auth)/sign-in.tsx` opts out of the keyboard-aware wrapper.
5. **Adapter calls return rows.** PrismaAdapter's `createUser`, `linkAccount`, etc. all do `prisma.{model}.create()` which uses `RETURNING *`. Any column declared in schema but missing in DB breaks them. Either:
   - run `prisma db push` first, or
   - add the column with a database default and don't reference it from app code until the push lands.

## Quick reference

- Smoke test endpoint: `/api/internal/auth-smoke-test`
- Audit comment block grep: `grep -rn "AUTH-CRITICAL FILE" apps/`
- Manual checklist: see "The manual verification checklist" above
- Past regression history: `git log --oneline --grep="auth\|oauth\|sign-in\|signin"`
- Status doc: `docs/launch-audit-2026-04-26/11-auth-hardening-shipped.md`
