# Acuity launch readiness — master punch list (2026-04-26)

Synthesised from the four audit files in this directory. Rank order is **fix-first → fix-before-launch → after-launch grooming → Jim-only manual actions**. Items are tagged with their owner where relevant.

---

## 🔴 BLOCKERS (App Store will reject; production unsafe)

These four blocks must clear before any submit-to-Apple action.

| # | Item | Owner | Est | Source |
|---|---|---|---|---|
| B1 | **Sign in with Apple** missing. Google OAuth is offered → Guideline 4.8 mandates Apple sign-in too. Hard reject. Add `expo-apple-authentication`, wire into `apps/mobile/app/(auth)/sign-in.tsx`, add entitlements. | Jim (mobile) | 2-3 days | App Store |
| B2 | **In-app account deletion missing on mobile.** Web has `POST /api/user/delete`. Mobile Profile tab has none. Mandatory since 2022. Add a destructive `MenuItem` to `apps/mobile/app/(tabs)/profile.tsx` with confirmation dialog. | Jim (mobile) | 4-6 hr | App Store |
| B3 | **Pre-launch hardening PR (#2) is OPEN, not merged.** Main is 16 commits ahead, branch 9 commits ahead. Fixes for: Gmail plus-addressing trial farming, CSPRNG referral codes, opaque Stripe webhook errors, `durationSeconds` clamp, Sentry edge PII, IP signup rate limit, AI SDK 30s timeouts, length caps on goals/tasks. Conflict-resolve and merge. | Claude (rebase) → Jim (review/merge) | 1-2 hr | Functionality + Security |
| B4 | **Stripe-only mobile subscriptions.** Defensible under 3.1.3(b) (multiplatform service) but real risk under 3.1.1. Have RevenueCat + StoreKit fallback plan ready. | Jim | Defer (reactive) | App Store |

---

## 🟠 PRE-LAUNCH MUST-HAVE (not blockers but needed before submit)

### Code-fixable now

| # | Item | File:line | Source |
|---|---|---|---|
| P1 | Mobile onboarding bare `null` return → blank screen | `apps/mobile/app/onboarding.tsx:35` | UX |
| P2 | Hardcoded `jim@heelerdigital.com` leaked in user-facing error copy | `apps/web/src/app/auth/signin/page.tsx:227` | UX |
| P3 | `/insights/ask` page renders blank body — title says "Ask your past self" but no UI | `apps/web/src/app/insights/ask/page.tsx` | UX |
| P4 | Onboarding step count mismatch (web says 10, registers 9) | `apps/web/src/app/onboarding/page.tsx:86` + `steps-registry.ts` | UX |
| P5 | Unguarded `JSON.parse` on Claude extraction response — malformed JSON throws unhandled | `apps/web/src/lib/pipeline.ts:231` | Functionality |
| P6 | Unguarded `JSON.parse` on weekly report response — async path can leave reports stuck QUEUED | `apps/web/src/app/api/weekly/route.ts:206` | Functionality |
| P7 | Silent `.catch(() => {})` on entry FAILED-status update → entries stuck in PROCESSING forever | `apps/web/src/lib/pipeline.ts:603-609` | Functionality |
| P8 | Mobile `entry.transcript` rendered unconditionally → "null" string for QUEUED/PROCESSING entries | `apps/mobile/app/entry/[id].tsx:195` | Functionality |
| P9 | Goal-list raw `HTTP 500` surfaced to user | `apps/web/src/app/goals/goal-list.tsx:692` | UX |
| P10 | Mobile goal save: identical "Couldn't save" for every error class | `apps/mobile/app/goal/[id].tsx:150` | UX |
| P11 | `recent-timeline` returns `null` when <3 entries → blank space on `/insights` | `apps/web/src/app/insights/recent-timeline.tsx:45` | UX |
| P12 | Calendar integrations section renders interactive-looking buttons that are all "Coming soon" | `apps/web/src/app/account/integrations-section.tsx:42` | UX |
| P13 | Mobile Ask Your Past Self / State of Me are stub "Coming soon" pages | `apps/mobile/app/insights/ask.tsx`, `…/state-of-me.tsx` | UX + parity |

### Action items requiring Jim

| # | Item | Est |
|---|---|---|
| J1 | Create reviewer Gmail `acuity.reviewer.b19@gmail.com`; share password securely; set Google profile name "Apple Reviewer" | 5 min |
| J2 | Extend seed-script allowlist for `acuity.reviewer*@gmail.com`, run `npx tsx scripts/seed-test-user.ts --email acuity.reviewer.b19@gmail.com --name "Apple Reviewer" --subscription-status PRO --with-entries 14 --force` | 30 min |
| J3 | Re-export app icon at 1024×1024 with **opaque** background (current `apps/mobile/assets/icon.png` is RGBA with transparency → Apple may reject) | 30 min |
| J4 | Capture 6 screenshots at 1290×2796 (6.9" iPhone): home+record / recording / extraction review / Theme Map / Life Matrix / Entries list. Per `docs/APP_STORE_REVIEW_NOTES.md §4.1-4.3`. | 2 hr |
| J5 | Build + upload Build 19 to TestFlight via EAS, sign in with reviewer account, verify Home + Insights + Theme Map + subscription state | 30 min |
| J6 | Fill phone number in ASC review contact form (currently "TO FILL" in review notes §3) | 2 min |
| J7 | Reconcile `app.json` version vs review notes (notes say v0.1.7, app.json v0.1.8) | 2 min |
| J8 | Run pre-submit grep: `grep -rn "\$[0-9]\|12\.99\|/mo\|/month\|Upgrade Now\|Subscribe\|Buy Now" apps/mobile/app apps/mobile/components` — should return zero matches | 5 min |
| J9 | Verify `apps/mobile/ios/Acuity/Acuity.entitlements` is populated post-EAS-build (currently empty stub) | 5 min |
| J10 | Expand `apps/mobile/ios/Acuity/PrivacyInfo.xcprivacy` with `NSPrivacyCollectedDataTypes` for Audio Data + UserContent (sample XML in `docs/launch-audit-2026-04-26/04-app-store.md`) | 15 min |

---

## 🟡 POST-LAUNCH GROOMING

| Item | Source |
|---|---|
| Life Audits feature missing from mobile (signature 14-day / quarterly reports — web only) | Parity |
| `weekly-insight-card` "Your first report is coming" copy ambiguous about whether user needs to record | UX |
| Task title silently truncated at 300 chars during commit-extraction | Functionality |
| Whisper <10 char transcript → permanent NonRetriable, no grace period | Functionality |
| Dead `entryDate` query in `weekly/route.ts:71` (schema doesn't populate it) | Functionality |
| `updateMany` Stripe webhook silently affects zero rows on orphaned customer ids | Functionality |
| Vocab confusion: "signal", "decoded", "Life Matrix area", "Day 14 audit" not explained for new users | UX |
| Goal sub-task copy says "sub-step" but UI says "sub-goal" | UX |
| Theme detail API has TODO placeholder copy that may surface to users | UX |
| `paywall.tsx:88` "Month two is where the pattern deepens" assumes user knows they're in month 1 | UX |

---

## How to use this

1. **Right now (this session):** Claude executes B3 conflict-resolve + merge prep, P1, P2, P3, P4, P5, P6, P7, P8 in parallel. Push as one or two coherent commits, deploy.
2. **Tonight / tomorrow:** Jim handles B1 (Sign in with Apple — biggest blocker), B2 (account delete on mobile), J1-J10.
3. **Once B1+B2+B3 land + J1-J10 complete:** submit to Apple.
4. **B4 reactive plan:** keep RevenueCat + StoreKit fallback ready in case Apple rejects on 3.1.1.

The four detail audit files (`01-functionality-bugs.md` through `04-app-store.md`) carry the full per-item rationale.
