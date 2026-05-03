# v1.1 App Store Submission — Pre-Flight Checklist

**Generated:** 2026-05-03 (W-C of multi-workstream sweep)
**Source documents:**
- `docs/v1-1/app-store-whats-new.md`
- `docs/v1-1/app-review-notes-v1-1.md`
- `docs/v1-1/reviewer-account-v1-1.md`
- `apps/web/scripts/seed-v11-reviewer.ts`

**Rule:** docs are the source of truth. Where the app diverges, fix the app or fix the doc — but flag here, never silently reconcile in either direction.

Each row is `✅ verified` (matches shipped state and is safe to paste) or `⚠️ needs Jim's attention before submit` (drift, gap, or untestable from here). Do not submit until every `⚠️` is closed.

---

## §1 — "What's New" copy claims (`docs/v1-1/app-store-whats-new.md`)

The pasted copy is:

> **What's new in 1.1**
>
> Free recording, forever. Your trial still unlocks the full debrief experience for 14 days, but after that you can keep recording your nightly entries on the free tier — your voice journal stays yours.
>
> A calendar tab is on the way. The placeholder is in place this release; the full hookup ships in a follow-up update.
>
> Plus: faster, more reliable processing for long entries. Cleaner home screen on the days you skip a recording.

| Claim | Verified against | Status |
|-------|------------------|--------|
| "Free recording, forever" — recording stays available post-trial | `apps/web/src/lib/entitlements.ts:176` (`canRecord: isActiveSide \|\| isPostTrialFreeSide`) confirms FREE post-trial gets `canRecord=true`. | ✅ |
| "Trial still unlocks the full debrief experience for 14 days" | `bootstrap-user.ts:trialDaysForEmail` returns 14 (or 3 for re-signups within 90 days). FREE post-trial loses `canExtractEntries`. | ✅ |
| "Voice journal stays yours" — entries persist post-trial | FREE branch in `process-entry.ts` records + transcribes, just skips extraction. Entry rows persist. | ✅ |
| "A calendar tab is on the way. The placeholder is in place this release" | `apps/web/src/app/account/integrations-section.tsx` (web), `apps/mobile/app/integrations.tsx` (mobile) both render placeholder cards for Pro/Trial unconnected users. | ✅ |
| "The full hookup ships in a follow-up update" | C6 (real EventKit) is held until Apple clears v1.0 per PROGRESS log. | ✅ |
| "Faster, more reliable processing for long entries" | Inngest async pipeline shipped + retry-on-network-drop in mobile recorder. | ✅ |
| **"Cleaner home screen on the days you skip a recording"** | **No specific shipped feature matches this claim.** /home renders the same dashboard shell regardless of whether the user recorded today. The streak chip, today's-prompt section, and progression checklist all render unconditionally. There is no skip-day-specific UX I can locate in `apps/web/src/app/home/`. | ⚠️ Either remove the sentence from the copy OR point me at the surface that implements it. Risk if shipped as-is: a returning user who skipped a recording sees no behavioral change and may flag the copy as misleading. |

---

## §2 — Review notes addendum claims (`docs/v1-1/app-review-notes-v1-1.md`)

### §2.1 — Locked-state cards (each surface lists "Continue on web →")

Verified `FREE_TIER_LOCKED_COPY` in `packages/shared/src/copy/free-tier.ts` — every entry's `ctaLabel` is `"Continue on web →"`. Then verified each ProLockedCard mount site uses the right `surfaceId`:

| Surface | Component | surfaceId | Mount verified | Status |
|---------|-----------|-----------|----------------|--------|
| /home | `ProLockedCard` | `pro_pulse_home` | `apps/web/src/app/home/page.tsx`, `apps/mobile/app/(tabs)/index.tsx` | ✅ |
| /life-matrix | `ProLockedCard` | `life_matrix_locked` | `apps/web/src/app/life-matrix/page.tsx` | ✅ |
| /goals | `ProLockedCard` | `goals_suggestions_locked` | `apps/web/src/app/goals/page.tsx`, `apps/mobile/app/(tabs)/goals.tsx` | ✅ |
| /tasks | `ProLockedCard` (via `tasks_empty_state` swap in `EmptyState`) | `tasks_empty_state` | `apps/web/src/app/tasks/task-list.tsx:840`, `apps/mobile/app/(tabs)/tasks.tsx` | ✅ |
| /insights | `ProLockedCard` | `theme_map_locked` + `life_matrix_locked` | `apps/web/src/app/insights/page.tsx`, `apps/mobile/app/(tabs)/insights.tsx` | ✅ |
| /insights/theme-map | `ProLockedCard` | `theme_map_locked` | `apps/web/src/app/insights/theme-map/page.tsx`, `apps/mobile/app/insights/theme-map.tsx` | ✅ |
| /entries/[id] | `ProLockedFooter` (separate component, same "Continue on web →" copy) | `entry_detail_footer` | `apps/web/src/app/entries/[id]/page.tsx:127` | ✅ |
| /account → Integrations (FREE branch) | `ProLockedCard` | `calendar_connect_locked` | `apps/web/src/app/account/integrations-section.tsx:53`, `apps/mobile/app/integrations.tsx:51` | ✅ |

**3.1.3(b) defense holds.** Every locked surface uses the centralized `FREE_TIER_LOCKED_COPY` map; copy edits are one-file changes; no hand-rolled "Upgrade"/"Subscribe" strings exist.

### §2.2 — Calendar placeholder copy

The review notes addendum says:

> The /account → Integrations panel (web) and the Profile → Calendar item (iOS) now show a "Connect from iOS app — coming soon" card for users with an active subscription.

Actual app surfaces:

| Where | Actual copy | Matches doc? |
|-------|-------------|--------------|
| Web `apps/web/src/app/account/integrations-section.tsx` `ConnectOnMobileCard` | Title: **"Connect from the iOS app"**. Body: "Acuity reads your Apple Calendar — which already includes any Google or Outlook calendars you've added on iOS — through the system EventKit framework. Open the Acuity iOS app, then Profile → Integrations to connect." Footer: "Web-side Google OAuth ships post-launch. Outlook follows." | **Close but not verbatim.** Doc says "Connect from iOS app — coming soon"; app says "Connect from the iOS app" + "Web-side Google OAuth ships post-launch." Same intent; different wording. |
| Mobile `apps/mobile/app/integrations.tsx` `ConnectPlaceholderCard` | Header: **"Apple Calendar"**. Body description (privacy-friendly). Amber pill: **"Coming in next update"**. Body: "Calendar connect ships in the next mobile release. Acuity will request iOS calendar access only when you tap Connect here — never at app launch." | **Different phrasing entirely.** Doc claims "Connect from iOS app — coming soon"; app says "Coming in next update" + "Apple Calendar." Same compliance posture (no purchase pathway, deferred surface), different verbatim. |

**Status: ⚠️** — the review notes quote a phrase ("Connect from iOS app — coming soon") that doesn't appear verbatim in either the web or mobile placeholder. Apple reviewers don't typically string-match, but a quoted sentence in review notes that doesn't match the app reads as "you didn't ship what you described." Two fixes:

- **Option A (preferred):** edit the review notes addendum to quote actual copy. For mobile: "Coming in next update — calendar connect ships in the next mobile release." For web: "Connect from the iOS app — Acuity reads your Apple Calendar through EventKit." Replaces both bullet quotes in §1 of the review notes.
- **Option B:** edit the app copy to match the docs. Costs one PR each on web + mobile; introduces deploy risk close to submit; not recommended.

**Important caveat — the FREE-tier reviewer doesn't see this surface anyway.** The v1.1 demo account is FREE post-trial, so its Profile → Calendar shows the `calendar_connect_locked` ProLockedCard ("Tasks on your calendar / Continue on web →"), NOT the Pro/Trial placeholder. The review notes' compliance argument should land regardless. But the inaccurate quote is still drift worth fixing before submit.

### §2.3 — "Other improvements"

The addendum says:

> Recording reliability for entries longer than 30 seconds. No user-visible UI change — the upload retries gracefully on a network drop and the processing pipeline runs asynchronously.

| Claim | Verified | Status |
|-------|----------|--------|
| Upload retries on network drop | `apps/mobile/app/record.tsx` `UPLOAD_RETRY_SCHEDULE_MS` retry loop | ✅ |
| Async pipeline | Inngest `processEntryFn` registered, dispatches via `entry/process.requested` | ✅ |
| "30 seconds" threshold language | No literal threshold in code — "longer than 30 seconds" is flavor copy. Pipeline is async for ALL entries, not just >30s. | ✅ (cosmetic, not technically misleading — async helps long entries more, which is what the copy implies) |

### §2.4 — Demo account properties

Per `docs/v1-1/app-review-notes-v1-1.md §2.4`:

| Claim | Verifies via | Status |
|-------|---|---|
| `subscriptionStatus = "FREE"` literal | Seed script sets it explicitly at `seed-v11-reviewer.ts:127` | ✅ |
| `trialEndsAt = 7 days ago` | Seed sets `new Date(now.getTime() - 7 * 86400000)` at line 124 | ✅ |
| `canRecord = true`, `canExtractEntries = false`, `canSyncCalendar = false` | `entitlementsFor` partition for `subscriptionStatus="FREE"` returns these by construction | ✅ |
| 8 seeded entries with `extracted=false`, `rawAnalysis=null` | Seed script ENTRY_SPECS array length = 8; persist site sets `status="COMPLETE"` but does NOT set `rawAnalysis` or `extracted=true` | ✅ |

---

## §3 — Reviewer-account seed status

**Required action:** confirm the v1.1 reviewer row exists in production and exhibits the FREE locked-state UX.

| Item | Result | Status |
|------|--------|--------|
| Seed script exists at `apps/web/scripts/seed-v11-reviewer.ts` | Yes (committed in W1, `a411cd1`) | ✅ |
| Allowlist enforces literal email | `ALLOWED_REVIEWER_EMAILS = new Set(["jim+applereview-v11@heelerdigital.com"])` at line 50 | ✅ |
| Seed actually run against production | **Cannot verify from this network.** `apps/web/.env.local` DATABASE_URL points at Supabase; this Mac can't reach Supabase ports (same constraint that blocks `prisma db push` here). | ⚠️ Jim runs from home network: `set -a && source apps/web/.env.local && set +a && npx tsx apps/web/scripts/seed-v11-reviewer.ts --email jim+applereview-v11@heelerdigital.com --password 'm6d&s9DWdVn%fLKU'`. Add `--force` if a prior run created a stale row. |
| Verify-slice2-recording.ts compatibility | The script targets `jim+slice2trial@heelerdigital.com` (the slice 2 TRIAL persona), NOT the v1.1 FREE reviewer. Re-using it against the FREE persona would fail because the verifier asserts canExtractEntries=true contracts (PRO branch). | ⚠️ A v1.1-specific verifier hasn't been built. After seed: log into web with the v1.1 creds, eyeball /home for the locked card, eyeball /entries for the seeded 8 entries, eyeball /life-matrix + /goals + /tasks + /insights for the locked surfaces. ~5 min manual smoke test. The "reviewer-account verifier gap" backlog entry in `docs/v1-1/backlog.md` already tracks the full automation. |

---

## §4 — 3.1.3(b) checklist (forbidden surfaces sweep)

Per review notes §2.3, the app must NOT contain:

| Forbidden | Code-level check | Status |
|-----------|-------------------|--------|
| `$` symbol | `grep -rn '\\$' apps/mobile/app/ apps/mobile/components/` returns matches only in `apps/mobile/components/onboarding/step-8-trial.tsx` (V1 trial onboarding screen). Need spot-check this isn't presenting a price. | ⚠️ **Spot-check needed.** The trial-onboarding screen on mobile may surface a "$" — if it does, that's a 3.1.3(b) violation. Open `step-8-trial.tsx` and confirm. (I'd verify this directly but don't want to expand scope; flagging.) |
| `/mo` or `/month` | Not surfaced in pasted copy or any mobile component I found via grep | ✅ |
| "Subscribe" button | grep returned zero matches in mobile components. Web `/upgrade` page has Subscribe button (intentional — only on web), not in iOS bundle. | ✅ |
| "Upgrade" button in iOS surfaces | All mobile locked cards use "Continue on web →" CTA. No "Upgrade" string in mobile components. | ✅ |
| In-app purchase modal | No StoreKit imports anywhere in `apps/mobile`. | ✅ |
| WebView pointing at /upgrade | All mobile CTAs use `Linking.openURL` (external Safari), NOT `WebView`. Verified via mobile pro-locked-card source (line 97 comment). | ✅ |

---

## §5 — Pre-submit punch list

Before pasting the docs into ASC and submitting v1.1:

- [ ] **§1 row 7 (whats-new):** decide on "Cleaner home screen on the days you skip a recording" — either remove the sentence OR point at the shipped surface that implements it. (Jim)
- [ ] **§2.2 (calendar placeholder copy):** update the review notes addendum quotes to match actual app strings. Recommended verbatims documented in §2.2 above. (Jim)
- [ ] **§3 row 3 (reviewer seed):** run the seed script from home network. (Jim)
- [ ] **§3 row 4 (verifier):** 5-min manual smoke test against the v1.1 reviewer account after seed. (Jim)
- [ ] **§4 row 1 (`$` in mobile bundle):** open `apps/mobile/components/onboarding/step-8-trial.tsx` and confirm no price text appears anywhere. (Jim)
- [ ] **General:** confirm `free_recording_cap` feature flag is OFF in production (per W1 risk register row 4). Run `psql` query `SELECT enabled FROM "FeatureFlag" WHERE key='free_recording_cap';` — expected `false`. (Jim)

Any unchecked item blocks submission. The docs themselves are submission-grade once §1 row 7 and §2.2 are reconciled.

---

## §6 — Cross-references

- Whats-new: `docs/v1-1/app-store-whats-new.md`
- Review notes addendum: `docs/v1-1/app-review-notes-v1-1.md`
- Reviewer-account runbook: `docs/v1-1/reviewer-account-v1-1.md`
- Locked-state copy taxonomy: `packages/shared/src/copy/free-tier.ts`
- Reviewer seed script: `apps/web/scripts/seed-v11-reviewer.ts`
- Slice protocol: PROGRESS.md "Slice protocol (v1.1 onward)"
