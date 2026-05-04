# Sentry / Vercel-logs Pass — 2026-05-04 (W4 weekly retro)

**Window:** 2026-05-02 (post-W2 audit, commit acc016f) → 2026-05-04 (this report). ~48h.
**Scope:** apps/web Vercel runtime logs + Sentry-eligible uncaught throws. Mobile (`@sentry/react-native`) still out of scope.
**Caveat from W2:** Vercel CLI is the de-facto signal source — `safeLog.warn` doesn't reach Sentry (W2 §3.1 finding still standing).

---

## TL;DR

Three ⚠️ findings worth attention, two of them new since W2:

1. **NEW (high signal, low impact): production DB is missing slice C3 + slice 5 columns.** `User.calendarConnectedProvider` and `User.backfillPromptDismissedAt` are throwing `P2022` in the Inngest pipeline, mostly inside non-fatal try/catches but generating ~7+ error-level log lines per recording. The defensive `enqueue-sync` short-circuit (slice C5b) covers the calendar-side write path, but the `process-entry`'s `update-streak` and `update-recording-stats` steps + `trial-email-orchestrator` write the User row directly without that short-circuit. **Diagnostic:** Jim hasn't run `prisma db push` from home since slice 5 (2026-05-02). The column gap is real; the schema declares them, the runtime expects them, the prod DB lacks them.
2. **NEW (low impact, longstanding): Google service account key parses as garbage.** `GOOGLE_APPLICATION_CREDENTIALS` env var contains a literal English string (`"It's {   "...`) instead of the JSON keyfile. Auto-blog and content-factory paths short-circuit cleanly (the catches are tagged `non-fatal`). Pre-existing config bug; not regression.
3. **Mobile-auth instrumentation has caught zero retries** since shipping 2026-05-03 23:11. Keenan hasn't retried Google sign-in since the patch went live. Standing diagnostic, ready for the next attempt.

No critical regressions from slices 4-7, the C4 outage recovery, the C3 schema-bomb hotfix, or the W-A Stripe race fix. Auth flow on the web side is clean.

---

## §1 — Findings, grouped

### 🔴 needs-fix-this-session

None. Every error in the window is either non-fatal (caught + logged) or already documented.

### 🟡 backlog candidate

**§1.1 — `User.calendarConnectedProvider` + `User.backfillPromptDismissedAt` P2022 storm.**

| Field | Affected paths | Severity |
|-------|----------------|----------|
| `User.calendarConnectedProvider` | `process-entry → update-streak`, `process-entry → update-recording-stats`, `trial-email-orchestrator` | ~5 errors/recording. All non-fatal but Inngest marks the whole step as failed (HTTP 206) which forces a retry. |
| `User.backfillPromptDismissedAt` | `trial-email-orchestrator` | 1 error/cron-tick. Same shape. |

**Evidence:** 7 P2022 events in the last 48h, all naming one of the two columns. All inside `try/catch` blocks tagged `(non-fatal)`. Inngest retries the step → P2022 again → eventually moves on after the retry budget. User-facing impact: zero. Operator-side impact: log noise, retry storm on every recording.

**Root cause:** the schema declares the columns (slices C3 and 5 added them), but production DB push hasn't applied them. Per the Phase 4 PROGRESS entry's manual-step list ("Run `npx prisma db push` from home network — adds 5 nullable columns"), Jim has run db push for slice 5's backfill columns AND for the IAP columns AND for the IapNotificationLog table — but the calendar columns from slice C3 (much older) appear to never have actually landed in production.

**Fix path:**
1. Jim runs `npx prisma db push` from home network. Should apply ALL pending columns idempotently.
2. After push, re-grep for P2022 in the next 24h log window — should drop to zero.
3. Until push lands, the noise is isolated to logs; nothing user-facing breaks.

**Why backlog and not "fix this session":** the impact is log noise, not user breakage. Each affected handler has already-tested non-fatal behavior. Push is a Jim-only action on his home network. Verified by re-checking PROGRESS — the slice 5 entry says "prisma db push has been run from home network" but that was 2026-05-02 and may have predated the schema additions that this entry surfaces.

**Defensive code option:** add the same `isMissingColumnError` short-circuit pattern from `enqueue-sync.ts` to the four affected sites in `process-entry.ts` and `trial-email-orchestrator.ts`. Estimated 30 min. Not blocking; the impact is purely logs.

**§1.2 — Google service account key is parsed as English text instead of JSON.**

`[google/auth] Failed to parse service account key: SyntaxError: Unexpected token 'I', "It's {   ""... is not valid JSON`

The env var `GOOGLE_APPLICATION_CREDENTIALS` (or whatever the lib reads) was set to a literal placeholder/explanation string starting with `"It's {`. The lib calls `JSON.parse` on it and surfaces the parse error.

**Affected:** auto-blog research step (GA4 fetch), GSC pruning step, content-factory pipeline. All are config-aware: when GA4/GSC data is unavailable, those Inngest functions log a `[research] GA4 fetch failed` warning and skip gracefully.

**Root cause:** misconfigured env var. Most likely set in Vercel as a string literal explaining the field rather than the actual JSON. Pre-existing — not introduced by any session work.

**Fix path:**
1. Pull the actual JSON keyfile for the GCP service account.
2. Paste it into Vercel's `GOOGLE_APPLICATION_CREDENTIALS` env var as a single-line stringified JSON (no newlines, no markdown formatting).
3. Verify in next auto-blog cron tick — should see successful GA4 fetch instead of the parse error.

**Why backlog:** the path is genuinely non-essential right now. Auto-blog still publishes blog posts (just without the GA4-driven topic ranking). Auto-blog-prune skips cycles (no harm; pruning is opportunistic). Affects content-factory in non-degrading ways.

### 🟢 monitoring only

**§1.3 — `mobile-auth.*` instrumentation: zero events.** The patch shipped 2026-05-03 23:11 (commit f4b11ca). Keenan hasn't retried Google sign-in since. The instrumentation is live and ready; once he retries, one of the four diagnostic events fires and we can root-cause the OAuth 401.

**§1.4 — `free-cap.*` events: zero.** Sticky-on cron runs Sundays 06:00 UTC. The flag is OFF in production (per `seed-feature-flags.ts`). No invocations expected; matches.

**§1.5 — `/home` 5xx: zero in 48h.** The C3 schema-bomb hotfix (2026-05-01) appears stable; the explicit-select sweep + the C5b enqueue-sync short-circuit holds.

**§1.6 — DEP0169 `url.parse()` deprecation warnings.** Node 24 surfaces these; not actionable. Vercel-side noise.

**§1.7 — Reddit 403s on auto-blog research.** Expected. Reddit blocks unauthenticated content fetches; auto-blog already short-circuits.

**§1.8 — auto-blog validation retries (Meta title length, primary keyword in H2).** Expected behavior — the LLM occasionally produces output that fails the SEO-validation gate; the function retries up to 3 attempts per the existing retry config.

---

## §2 — Cross-checks against this session's slices

Verifying nothing fired against slices we shipped:

| Slice | Commit | Sentry-eligible failures | Notes |
|---|---|---|---|
| W2 Stripe @unique | `e55979f` | 0 | Schema change only; not yet pushed to prod (Jim's manual step) |
| Phase 3a IAP wrapper | `9aec449` | 0 | Dead code (flag-off); endpoint /api/iap/verify-receipt has zero callers |
| Phase 3b dual-CTA | `8fbe78b` | 0 | Same; flag-off render-only path |
| Mobile-auth instrumentation | `f4b11ca` | 0 (no retries yet) | Standing diagnostic |
| Phase 2 IAP backend | `2a978aa` | 0 | Dead code; endpoints reachable but no callers |
| Phase 4 schema | `e29e311` | 0 | Schema-only; columns added cleanly |
| W-A Stripe race fix | `8c0a7ed` | 0 | No payment_failed retries to test the new guard yet |
| Slice 7 IAP polish | `c276175` | 0 | Schema additions for free-cap landed cleanly |

The C4 outage from 2026-05-01 (3-arg `inngest.createFunction` crashing /api/inngest page-data collection) shows zero recurrence — the 2-arg form across all functions held.

The C3 schema-bomb hotfix (Task default-projection P2022) is partially-validated: Task-side queries are clean, but the User-side P2022 in §1.1 is the same general pattern in a different surface — just Inngest-only and isolated.

The W-A Stripe `payment_failed` resurrection guard is untested in production since shipping (no payment failures in the window). The guard logic is unit-test-covered; production-side proof awaits a real failure event.

---

## §3 — Triage table

| # | Finding | Severity | Category | Owner | Action |
|---|---------|----------|----------|-------|--------|
| §1.1 | `User.calendarConnectedProvider` / `backfillPromptDismissedAt` P2022 | Medium (log noise + retry waste) | Backlog | Jim | Run `npx prisma db push` from home |
| §1.2 | `GOOGLE_APPLICATION_CREDENTIALS` parse error | Low (auto-blog graceful degradation) | Backlog | Jim | Replace env-var value with actual JSON keyfile |
| §1.3 | `mobile-auth.*` instrumentation pending retry | n/a | Monitoring | Keenan | Retry Google sign-in once |
| §1.4-§1.8 | Various — free-cap zero, /home 5xx zero, DEP warnings, Reddit 403s, auto-blog retries | Low / monitoring-only | Monitoring | — | No action |

**Defensive code option (worth ~30 min when bandwidth allows):** extend the `isMissingColumnError` short-circuit pattern from `apps/web/src/lib/enqueue-sync.ts` to wrap the `update-streak` + `update-recording-stats` writes in `process-entry.ts` and the trial-email-orchestrator. Same pattern, four call sites, no behavior change beyond silencing P2022. Backlog candidate.

---

## §4 — One-line summary

System is healthy. The only non-trivial finding is a schema-vs-prod-DB column drift on User (calendarConnectedProvider, backfillPromptDismissedAt) that Jim's pending `prisma db push` resolves. No regressions from session slices, no new critical bugs, no Stripe-race resurrections, no /home 5xx since the C3 hotfix.

---

## §5 — Cross-references

- Prior pass: `docs/v1-1/sentry-pass-2026-05-02.md` (W2 retro)
- safeLog source: `apps/web/src/lib/safe-log.ts`
- Sentry server config: `apps/web/sentry.server.config.ts`
- Mobile-auth instrumentation: commit f4b11ca, `apps/web/src/lib/mobile-auth.ts`
- enqueue-sync defensive pattern (the model for §1.1's defensive code option): `apps/web/src/lib/enqueue-sync.ts:144`
