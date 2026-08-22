# Credential Leak Audit

**Date:** 2026-04-19
**Trigger:** `apps/web/.env.local.save` was committed to a **public** GitHub repo at commit `799a635` (2026-04-13, "switch to Resend SDK for email sending").
**Scope:** Every key name present in that committed file, plus a history sweep for any other `.env*` file ever added to git.
**Status of this document:** Read-only audit. No rotation performed by Claude. Rotation is Jim's job (paired with Keenan).

---

## 1. Summary

- **One credential was actually leaked with a populated value:** the Supabase Postgres password `KeenanJim525$` for project `rohjfcenylmfnqoyoirn`, appearing twice on line 1 of the file (once in a pooler connection string, once in a direct connection string). Password is URL-encoded as `KeenanJim525%24` in the leaked strings.
- **Every other key name in the file was present with an empty value** (`""`). That means no Anthropic, OpenAI, Stripe, Resend, Google OAuth, or NextAuth secret was *directly* leaked from this file.
- **We still classify each key by its category** (per Jim's instruction), so rotation discipline can be applied uniformly — if any of those keys *were* in the developer's local environment at commit time and got scrubbed before push, we can't verify from git alone. Treat the full file as the blast radius.
- **No other `.env*` files** have ever been added to git history besides `.env.example` (intentional, contains only placeholders).
- **Current `.gitignore` does NOT prevent this from recurring.** The pattern `.env.local` is a literal filename match; it does not match `.env.local.save`. See §4.

---

## 2. Full key list from `apps/web/.env.local.save` at commit 799a635

Retrieved via `git show 799a635:apps/web/.env.local.save`. The file is a stock `.env.local` template with an extra blob prepended to line 1. That blob is the leak. Everything else is empty placeholders.

### 2.1 The actual leak (line 1, pre-template)

Two real Postgres connection strings were pasted at the start of line 1, ahead of the template comment header:

- Supabase pooler connection string — includes the password
- Supabase direct connection string — includes the same password

Password, project ref, and hosts are all exposed. These are the only populated credentials in the file.

### 2.2 Template keys (all values empty `""`)

In the order they appear in the file:

| # | Key | Section | Value in leak |
|---|---|---|---|
| 1 | `DATABASE_URL` | Database | empty (but password leaked via line-1 raw string) |
| 2 | `DIRECT_URL` | Database | empty (but password leaked via line-1 raw string) |
| 3 | `NEXT_PUBLIC_SUPABASE_URL` | Supabase | empty |
| 4 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | empty |
| 5 | `SUPABASE_SERVICE_ROLE_KEY` | Supabase | empty |
| 6 | `SUPABASE_STORAGE_BUCKET` | Supabase | `"acuity-audio"` (not a secret) |
| 7 | `NEXTAUTH_URL` | Auth | `"http://localhost:3000"` (not a secret) |
| 8 | `NEXTAUTH_SECRET` | Auth | empty |
| 9 | `GOOGLE_CLIENT_ID` | Google OAuth | empty |
| 10 | `GOOGLE_CLIENT_SECRET` | Google OAuth | empty |
| 11 | `EMAIL_SERVER_HOST` | Email (Resend SMTP) | `"smtp.resend.com"` (not a secret) |
| 12 | `EMAIL_SERVER_PORT` | Email (Resend SMTP) | `"465"` (not a secret) |
| 13 | `EMAIL_SERVER_USER` | Email (Resend SMTP) | `"resend"` (not a secret) |
| 14 | `EMAIL_SERVER_PASSWORD` | Email (Resend SMTP) | empty (would be the Resend API key) |
| 15 | `EMAIL_FROM` | Email (Resend SMTP) | `"Acuity <noreply@acuity.app>"` (not a secret) |
| 16 | `ANTHROPIC_API_KEY` | AI | empty |
| 17 | `OPENAI_API_KEY` | AI | empty |
| 18 | `STRIPE_SECRET_KEY` | Stripe | empty |
| 19 | `STRIPE_WEBHOOK_SECRET` | Stripe | empty |
| 20 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | empty |
| 21 | `STRIPE_PRO_PRICE_ID` | Stripe | empty |
| 22 | `EXPO_PUBLIC_API_URL` | Mobile | `"http://localhost:3000"` (not a secret) |
| 23 | `EXPO_PUBLIC_SUPABASE_URL` | Mobile | empty |
| 24 | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile | empty |

---

## 3. Classification + rotation guidance

Classification follows Jim's rule (category-based, not value-based). Per-row note says whether the value was *actually* populated in the commit (and thus definitively compromised), or whether the category-based rotation is discipline-only.

### 3.1 🔴 ROTATE REQUIRED

| Key | Populated in leak? | Notes |
|---|---|---|
| **Supabase DB password** (covers `DATABASE_URL` + `DIRECT_URL`) | **YES — line 1 of file** | `KeenanJim525$` for project `rohjfcenylmfnqoyoirn`. Rotate in Supabase dashboard now. Update Vercel env. **Already flagged critical in `AUDIT.md` and PROGRESS.md.** |
| `SUPABASE_SERVICE_ROLE_KEY` | No (empty in file) | Service role bypasses RLS → treat as DB-equivalent. Category requires rotation; value not definitively exposed. Rotate as hygiene if any doubt. |
| `NEXTAUTH_SECRET` | No (empty in file) | Signs session JWTs. If leaked, session hijacking is trivial. Category requires rotation. Rotate as hygiene (`openssl rand -base64 32`). |
| `GOOGLE_CLIENT_SECRET` | No (empty in file) | OAuth client secret. Category requires rotation. Rotate in Google Cloud Console → Credentials → OAuth 2.0 Client. |
| `EMAIL_SERVER_PASSWORD` (Resend API key) | No (empty in file) | Billable email sender. Category requires rotation. Rotate in Resend dashboard; update Vercel env. |
| `ANTHROPIC_API_KEY` | No (empty in file) | Billable API. Category requires rotation. Rotate in Anthropic console. |
| `OPENAI_API_KEY` | No (empty in file) | Billable API (Whisper). Category requires rotation. Rotate in OpenAI dashboard. |
| `STRIPE_SECRET_KEY` | No (empty in file) | Payment system. Category requires rotation. In Stripe Dashboard → Developers → API keys → Roll secret key. |
| `STRIPE_WEBHOOK_SECRET` | No (empty in file) | Webhook signing. Category requires rotation. Recreate the webhook endpoint in Stripe to generate a new signing secret; update Vercel. |

**Note on "no value in file but category-rotate-required":** the conservative call is to rotate all of the above regardless. The file was on a developer machine at some point with real values in those fields (most likely — this is a typical local-dev env file). Git history doesn't tell us whether a populated version was saved in the editor buffer and then blanked before the `git add`. Rotating everything is ~30 minutes of work and removes ambiguity.

### 3.2 🟡 ROTATE RECOMMENDED

| Key | Populated in leak? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No (empty in file) | Anon keys are *designed* to be public (protected by RLS), but hygiene says rotate alongside the DB password — if RLS policies have any holes, a known anon key speeds up exploitation. Rotate in Supabase dashboard. Same key value typically used for `EXPO_PUBLIC_SUPABASE_ANON_KEY`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No (empty in file) | Same underlying key as above — rotate once, update both env vars. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No (empty in file) | Publishable keys are public by design. Can't be rotated directly from the Stripe UI the same way secret keys are rolled, but if you rotate `STRIPE_SECRET_KEY` (§3.1) that creates a fresh restricted-key pairing; make sure the publishable key matches the active account mode (test vs live). Not urgent. |

### 3.3 🟢 NO ROTATION NEEDED

These are configuration, not credentials, or are non-rotatable identifiers.

| Key | Reason |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL derived from Supabase project ref; not rotatable. Project ref `rohjfcenylmfnqoyoirn` is already exposed via the line-1 connection strings, so hiding the URL wouldn't help. (Separate call on whether to migrate Supabase projects entirely — see §6.) |
| `EXPO_PUBLIC_SUPABASE_URL` | Same URL as above. |
| `SUPABASE_STORAGE_BUCKET` | Bucket name (`"acuity-audio"`). Access is gated by RLS / signed URLs, not by name secrecy. |
| `NEXTAUTH_URL` | Localhost or `https://getacuity.io`; public by design. |
| `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER` | SMTP config; `"smtp.resend.com"` / `"465"` / `"resend"` are Resend defaults. |
| `EMAIL_FROM` | Public sender email. |
| `STRIPE_PRO_PRICE_ID` | Product price identifier; not a credential. |
| `EXPO_PUBLIC_API_URL` | Just a URL. |

---

## 4. `.gitignore` — does it prevent recurrence?

**Short answer: no.** Confirmed by reading `/Users/jcunningham525/projects/Acuity/.gitignore` at HEAD.

**Current env-file patterns (`.gitignore:12-17`):**

```
# Env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
```

Each line is a literal filename match in git glob semantics. `.env.local` matches exactly `.env.local`; the `*` wildcard is NOT implied. Concretely:

| Filename | Matched by current `.gitignore`? |
|---|---|
| `.env.local` | ✅ yes |
| `.env.local.save` | ❌ NO — this is how the leak happened |
| `.env.local.bak` | ❌ NO |
| `.env.local.swp` | ❌ NO (also not matched by `*.swp` because of the leading dot? actually `*.swp` matches — but editor swap files typically live as `.env.local.swp` which does match `*.swp`; safe only by coincidence) |
| `.env.production` | ❌ NO |
| `.env.staging` | ❌ NO |
| `.env.development` (without `.local`) | ❌ NO |
| `.env.prod.local` | ❌ NO |

### 4.1 Recommended replacement

```
# Env files — ignore everything matching .env*, track only .env.example
.env
.env.*
!.env.example
```

- Line 1 matches literal `.env` (the common Next.js "all environments" file).
- Line 2 matches `.env.local`, `.env.local.save`, `.env.local.bak`, `.env.production`, `.env.production.local`, `.env.staging`, `.env.dev.swap`, etc. — anything starting with `.env.` followed by any non-slash characters.
- Line 3 un-ignores `.env.example` so the template stays tracked. Git processes gitignore top-to-bottom; negation must come AFTER the broader ignore.

This is the Next.js + Vercel convention and covers every editor-backup suffix (`.save`, `.swp`, `.bak`, `~`) as well as every environment variant.

### 4.2 Also flagged in `AUDIT.md` and worth adding at the same time

From AUDIT.md §8 — while editing `.gitignore` for the env fix, also add:

```
# Secrets / keys / OAuth tokens
*.pem
*.p12
*.key
credentials.json
token.json
google-services.json
GoogleService-Info.plist

# Terraform state with secrets
*.tfvars
```

None of these are currently tracked (verified via git history sweep in §5), but they're common accidental commits and cheap to guard against.

### 4.3 Belt-and-suspenders: a pre-commit hook

The gitignore fix prevents the next `git add`, but a committed secret would slip past a careless `git add -f` or a renamed file. Worth installing a pre-commit secret scanner (e.g., `gitleaks` or `detect-secrets`) in the same PR. Low effort; catches entire classes of mistakes this one file exemplified.

---

## 5. Other `.env*` files in git history

Command used: `git log --all --diff-filter=A --name-only --pretty=format:"%n=== %H %ad %s" --date=short -- "**/.env*" ".env*"`

Results:

| Commit | Date | File | Status |
|---|---|---|---|
| `6115191` | 2026-04-07 | `.env.example` | ✅ Intentional. Placeholders only. Verified clean — all values are `[PASSWORD]`, `[PROJECT_REF]`, or empty. |
| `799a635` | 2026-04-13 | `apps/web/.env.local.save` | 🔴 The leak. This document. |

**No other `.env*` files** have ever been added to git history in this repo. The blast radius is confined to this one commit.

Because the repo was renamed/transferred from `keypicksem/Acuity` → `jimheelerdigital/Acuity` (PROGRESS.md 2026-04-17), GitHub's fork and event history on the original owner's account may still carry this commit even after we purge it from the current repo. GitHub caches commit SHAs indefinitely — if anyone ever grabbed the `.save` file contents via the GitHub API while the leaked commit was live, rotation is the only real mitigation. Purging history is hygiene; rotation is the fix.

---

## 6. Residual concern — project ref exposure

Even after password rotation, the **Supabase project ref `rohjfcenylmfnqoyoirn` is permanently known**. That ref is reachable at `db.rohjfcenylmfnqoyoirn.supabase.co` and at `aws-1-us-west-2.pooler.supabase.com`. An attacker with the old password already has:

- The direct DB hostname.
- The pooler hostname.
- The database name (`postgres`).
- The Postgres user (`postgres` / `postgres.rohjfcenylmfnqoyoirn`).

Rotating the password closes the only credential, but the project itself is named. Two options:

- **Accept and monitor.** Rotate password, enable Supabase's connection logging, check for anomalous source IPs from now until the project is retired. Cheapest.
- **Migrate to a new Supabase project.** New project = new ref = full blast-radius reset. More work (full data copy, env rotation across Vercel + mobile, downtime window), and the old project has to be explicitly decommissioned. Only worth it if Supabase logs show anomalous access or if paranoia wins.

**Recommendation:** accept and monitor. The password-rotation window is small, the project is otherwise protected by RLS + service-role key (which is being rotated §3.1), and migration is expensive relative to the residual risk.

---

## 7. Rotation order (recommended)

When Jim and Keenan do the rotation, roughly this order minimizes downtime windows:

1. **Supabase DB password** (highest priority — this is the actually-leaked secret). Rotate in Supabase dashboard → Database → Connection string. Update `DATABASE_URL` and `DIRECT_URL` in Vercel (production + preview) and in any local `.env.local`. Redeploy web app to pick up new value.
2. **Supabase anon key** and **service role key**. Rotate in Supabase dashboard → Project Settings → API. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` across Vercel + mobile EAS secrets.
3. **NEXTAUTH_SECRET**. `openssl rand -base64 32` → Vercel. Note: rotating this invalidates every currently-active session; acceptable given the user base size (per PROGRESS.md 2026-04-18, test accounts only).
4. **Stripe keys.** Roll `STRIPE_SECRET_KEY` in Stripe Dashboard → Developers → API keys. Recreate webhook endpoint to get a fresh `STRIPE_WEBHOOK_SECRET`. Verify webhook still points at `https://getacuity.io/api/stripe/webhook` (PROGRESS.md open item).
5. **Google OAuth.** Generate new client secret in Google Cloud Console → Credentials. Update Vercel.
6. **Resend API key.** Create new key in Resend dashboard; update `RESEND_API_KEY` / `EMAIL_SERVER_PASSWORD` in Vercel. Delete old key.
7. **Anthropic + OpenAI API keys.** Rotate in each provider's console. Update Vercel.

After all rotations: `.gitignore` fix + pre-commit scanner + history purge (`git filter-repo` or BFG) as a follow-up hygiene PR. Because the repo was public, purging history does not retroactively unleak — rotation is the only real fix.

---

*End of report.*
