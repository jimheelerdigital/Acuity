# Morning report — 2026-06-12

Overnight autonomous session on `feat/v1.3.3-background`. No urgent flags — nothing critical broke, no prod-down, no data loss. Phase 2 + Phase 3 + Issues A & C shipped; **Issue B (review gate) deliberately deferred** for your review (rationale in §4/§5, plan in §6). Build 80 cut for TestFlight; web deployed to prod.

---

## 1. WHAT SHIPPED

All commits on `feat/v1.3.3-background`, merged to `main` via `6deb5b4`.

| Commit | What |
|---|---|
| [`5ea8967`](https://github.com/jimheelerdigital/Acuity/commit/5ea8967) | **P2/P3 server push** — `entry-push.ts` (Expo send, reuses trial-countdown pattern) + completion push at process-entry end (COMPLETE-rechecked) + failure push in `onFailure`. `data.entryId` for routing. |
| [`8f025e8`](https://github.com/jimheelerdigital/Acuity/commit/8f025e8) | **Mobile tap routing** — `notification-routing.ts`: warm (`addNotificationResponseReceivedListener`) + cold (`getLastNotificationResponseAsync`) → `/entry/[id]`. Mounted in `_layout.tsx`. |
| [`ab5658c`](https://github.com/jimheelerdigital/Acuity/commit/ab5658c) | **Web in-app toast (sonner)** — `PendingEntriesProvider` polls `/api/entries/[id]` across navigation; COMPLETE/FAILED → toast → tap to `/entries/[id]`. Both web record paths register on 202. |
| [`2b3fdcc`](https://github.com/jimheelerdigital/Acuity/commit/2b3fdcc) | **Issue A** — entry rows locked while processing (faded, not tappable, web chevron hidden); swipe/long-press delete preserved. iOS+Android+web. |
| [`f5da710`](https://github.com/jimheelerdigital/Acuity/commit/f5da710) | **Issue C** — web delete now destructive red (was faded grey). Mobile menu already token-driven (2026-05-30) — no change needed. |
| `b4edb4e` | Merge main→branch (picks up tour 50pt fix for build 80) |
| `6deb5b4` | Merge branch→main (deploy web) |

Phase 2 + 3 are complete across all three platforms: **iOS** full push + tap-routing; **Android** uses the same Expo sender (auto-activates when FCM lands — no code change then); **web** sonner toast (no Web Push, per plan). Failure variant covered too.

## 2. WHAT'S ON TESTFLIGHT

- **Build 80** (`v1.3.3`, id `7f251a3e`, commit `b4edb4e`, profile `testflight-async`) — carries Phase 2/3 + Issues A/C + v1.3.3 background processing + tour 50pt fix + silence guard. **Build FINISHED + submitted to TestFlight** (Apple processing ~5–10 min, then installable). Install: **https://appstoreconnect.apple.com/apps/6762633410/testflight/ios** .
- Builds 78 + 79 already there.
- **NOT submitted to App Store** (TestFlight only, per your instruction).

## 3. WHAT'S ON PROD WEB

- **main HEAD: `6deb5b4`** (pushed ~end of session).
- Latest getacuity.io deploy at write-time: `ee7bf15` READY; **`6deb5b4` deploying** (will be live within minutes — verify `https://getacuity.io`).
- Active on prod from tonight: **Issue A** row-lock + **Issue C** destructive delete. **Dormant on prod** (until the async flag flips): Phase 2/3 server push fires only for async-path entries (the TestFlight dogfood); the web sonner toast only triggers on the async 202. Regular prod users (sync path) see no behavior change.
- **prod `ENABLE_INNGEST_PIPELINE` is still OFF — I did NOT flip it** (see §5.8).

## 4. WHAT FAILED / GOT STUCK

- **Issue B (review gate) — deferred, not attempted in code.** It changes the live auto-commit flow (the path behind the 138-orphan-tasks bug), adds a cron + endpoint + 2-platform UI I can't QA overnight, and the standing rule counsels caution on Task/Goal writes. I judged shipping it unsupervised too risky and stopped. Full plan in §6 so it's a fast greenlight.
- **Issue A "subtle haptic/visual confirm on COMPLETE"** — the *lock* shipped; the *transition* haptic (fire when a row flips processing→complete) needs prev-status tracking in the list and was skipped as polish. Minor.
- No build/deploy failures otherwise. If build 80 shows "building" forever in TestFlight, EAS or the auto-submit stalled — re-run `eas submit -p ios --profile production --id 7f251a3e-1cb5-4c75-b7a2-aa29f68d9b58`.

## 5. DECISIONS I MADE WITHOUT YOU

1. **Deferred Issue B entirely** — highest-risk item, regresses a known bug if wrong, un-QA-able overnight. *Reversible: it's simply not done; §6 plan ready.*
2. **Completion push fires at the END of process-entry** (status re-checked COMPLETE) not right after persist — so a late memory/lifemap downgrade to PARTIAL doesn't send a false "insights ready." *Easily reversible.*
3. **No-schema idempotency** (you pre-approved) — push fires once per run; a manual reprocess re-notifies (rare/benign). *Reversible.*
4. **sonner** for the web toast (you pre-approved).
5. **Both web record paths register with PendingEntries on 202.** Minor known redundancy: if the user stays on the record page they may see the inline result *and* the toast — both correct, toast dismissible. *Tunable.*
6. **Failure push only on `FAILED`, not `PARTIAL`** — PARTIAL keeps a transcript (softer), handled in-app. *Reversible.*
7. **Issue C web-only change** — mobile's entry-detail menu was already token-driven + aligned (2026-05-30 rewrite) and web has no separate context menu, so only the web delete needed the destructive treatment. Parity preserved (both now red).
8. **Merged `feat/v1.3.3-background` → main to deploy the web changes** (per your "deploy web changes to main"). This brings the v1.3.3 *mobile* code onto main too — but prod `ENABLE_INNGEST_PIPELINE` stays **OFF**, so prod behavior is unchanged beyond the dormant new code + active Issue A/C styling. **The App Store build + the prod async flag flip remain entirely your call.** *Reversible by reverting the merge, but the web changes are wanted.*
9. **Build 80 = `testflight-async`** (async dogfood, per-request header), submitted to TestFlight only.

## 6. WHAT I NEED YOU TO DO (ordered)

1. **(~2 min) Confirm + install build 80** → https://appstoreconnect.apple.com/apps/6762633410/testflight/ios . Dogfood: completion push ("Your insights are ready" → tap opens the entry) on a 2nd recording; Issue A lock; Issue C red delete; tour 50pt buttons; silence guard (record muted → "We didn't capture any sound").
2. **(~2 min) Verify web** → https://getacuity.io (confirm `6deb5b4` deployed; entries-list delete is red).
3. **(~5 min) Greenlight Issue B plan (§ below)** so I implement it next session.
4. **(~3 min) Decide the prod async flip** — `ENABLE_INNGEST_PIPELINE=1` enables background processing for all web/app users. Currently OFF (dogfood-only via header). https://vercel.com/heelerdigital/acuity-web/settings/environment-variables
5. **(longer) Magic-link web-handoff** — branch `feat/magic-link-web-handoff` still needs Keenan's `prisma db push` (MagicLinkToken table) + your HIGH-RISK auth review before merge (see PROGRESS 2026-06-10 entry).

### Issue B — proposed implementation plan (for your greenlight)
- **Server gate:** in `process-entry.ts persist-extraction`, skip `commitExtractedItems` for entries (leave tasks/goals in `rawAnalysis`, `extracted=false`, `extractionCommittedAt=null`). Sync path (`pipeline.ts`) unchanged or matched.
- **Confirm endpoint:** `POST /api/entries/[id]/commit-extraction` → runs `commitExtractedItems` + sets `extracted=true` + `extractionCommittedAt`. Fires `review_gate_confirmed`.
- **7-day backstop:** Inngest cron — find `status=COMPLETE, extracted=false, createdAt < now()-7d` → commit silently. **This is the orphan-bug guardrail; it must be tested before relying on it.**
- **UI (iOS+Android+web):** on first open of an un-committed entry, show the extracted tasks/goals from `rawAnalysis` with a "Looks good" confirm (→ endpoint) + dismiss. Fire `review_gate_shown` / `_dismissed`.
- **Events:** add `review_gate_shown / _confirmed / _dismissed` to `VALID_EVENTS`.
- **Risk:** the gate + cron must be correct or orphans return after 7 days. Recommend shipping behind a flag, validating the cron, then enabling.

## 7. OPEN LOOPS

- **Issue B** (review gate) — deferred, §6 plan.
- **Magic-link web handoff** — `feat/magic-link-web-handoff`, awaiting Keenan db push + your auth review.
- **Settings UX redesign** — queued, not started.
- **Android baseline slice** — per `docs/android-readiness-audit-2026-06.md` (OAuth client + SHA-1, FCM creds, IAP Play products, Play submission). Note: wiring FCM here also auto-activates Android completion/failure push (Phase 2/3 sender is already platform-agnostic).
- **Recording-reliability P2/P3** (⚠️ name clash with the push Phase 2/3 — *these* are: web **live audio meter** + 5s in-recording warning, and web **`enumerateDevices` Bluetooth hint**). Not started.
- **Audio-recovery admin endpoint** (`/api/admin/entries/[id]/reprocess`) — shipped + live, still useful for stuck entries. The 4 connection-error entries were left FAILED per your call (3 of 4 would recover; 1 was genuinely silent).
- **Prod async flag flip** — deferred to you (§6.4).

## 8. USER REPORTS (overnight FAILED entries)

Queried `Entry` joined to `User`, last 16h. **One** FAILED entry:
- `keenan@heelerdigital.com` (TRIAL, internal) — 1 failure, "no speech detected", a genuinely silent recording. **Does not meet the flag threshold** (>1 failure / paying user). Benign; the P1 silence guard (build 80) prevents silent uploads going forward. No action needed.

No paying-user failures, no repeat-failure users overnight.
