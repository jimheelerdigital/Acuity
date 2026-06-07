# Settings UX Redesign — Proposal (audit-first)

**Status:** APPROVED — decisions locked (§6). QUEUED, not started.
**Date:** 2026-06-07
**Scope:** iOS (`apps/mobile/app/(tabs)/profile.tsx` + sub-screens) and web (`apps/web/src/app/account/`). Eventual implementation will follow `_design/DESIGN_SYSTEM.md`.

> **⛔ Do NOT start until ALL of these are true:**
> 1. `feat/web-art9-consent` merged to main + deployed to prod.
> 2. `feat/web-product-tour` merged to main + deployed to prod.
> 3. The 4 web bugs (tour auto-fire, replay link, add-task, date off-by-one) are closed/verified.
>
> **First slice = RESTRUCTURE ONLY** (iOS + web together, ≈6d). Parity-gap closure is a SEPARATE follow-up slice after restructure ships.

## TL;DR
Both Settings surfaces grew organically into flat lists. iOS = 5 ad-hoc groups; web = **16 flat sections** in one long scroll with a **sticky sub-nav that's out of sync** (missing Calendar / Help / Backfill). They've also **drifted apart** (web has Referrals, Email digests, Life-Matrix dimensions, Data export, Cookie prefs that iOS lacks; iOS has Face ID, Haptics, in-app IAP that web handles differently). This proposes one **grouped index → sub-page** structure shared by both, maps every existing row into it, and flags the parity gaps + the few placement decisions only you can make.

---

## 1. Current-state audit (condensed)

### iOS — `profile.tsx` (one scroll, 5 ad-hoc groups)
| Group (today) | Rows | Destination | Data |
|---|---|---|---|
| (header) | Avatar, name, email, subscription pill | — | User.name/email/subscriptionStatus |
| (Subscription block) | Subscribe / Manage on web / Manage in iOS Settings / Manage subscription / Restore | /subscribe, Safari, Stripe portal | subscriptionStatus/source, hasStripeCustomer |
| ACTIVITY | Achievements (`N of M · pts`) | /achievements | GET /api/achievements |
| PREFERENCES | Appearance card, Haptics, Reminders, Replay tour, Security*, Calendar, Privacy, Connect Google Calendar | /reminders, /security, /integrations, /privacy, Safari | theme, haptics, reminders, autoLock, consent, calendar settings |
| SUPPORT | Send feedback | FeedbackModal | POST /api/feedback/submit |
| ACCOUNT | Sign out, Delete account | actions/modals | — |

\* Security only shows when `lockCapable` (device has biometry/passcode). Sub-screens: `/security` (Face ID toggle + auto-lock picker), `/reminders` (multi-reminder list), `/privacy` (analytics toggle + Art.9 withdrawal), `/achievements`, `/integrations` (EventKit), `/subscribe` (IAP).

### web — `account-client.tsx` (16 flat sections, single column + sticky sub-nav)
profile · TrialStatusCard · subscription · reminders · **life-dimensions** · **referrals** · **email digests** · integrations (outbound task sync) · **calendar (Google inbound)** · **backfill (older entries)** · **data export** · support (crisis) · help (replay tour) · appearance · **privacy (cookies)** · danger (delete).
- **Sub-nav out of sync:** missing `#calendar`, `#help`, `#backfill`.
- **No grouping** — all 16 are flat siblings.

### Key problems
1. No category grouping on either platform (long flat scroll).
2. Web sub-nav drifts from the actual sections (manual hardcoded list).
3. **Platform parity gaps** (web-only: referrals, email digests, life-dimensions, data export, cookie prefs; iOS-only: Face ID, haptics, in-app IAP, send-feedback, crisis-resources is **web-only**).
4. Related things split (Support & safety vs Help & onboarding; two Calendar integrations; backfill stranded mid-list).

---

## 2. Proposed grouped structure

Your 7 groups, plus one addition I'd strongly recommend (**Appearance** — neither theme nor haptics has a home in the 7). Each group becomes a **sub-page** reached from a Settings index. Platform tags: `[both]` `[iOS]` `[web]`.

| Group | Rows | Notes |
|---|---|---|
| **Account** | Profile: name, email `[both]`; Life-Matrix dimensions `[web]` | Name/email are read-only today — decision: make editable? |
| **Subscription** | Plan/trial status + manage/cancel `[both]`; Restore purchases `[iOS]`; Referrals & rewards `[web]` | Trial card folds in here as the status header |
| **Notifications** | Reminders `[both]`; Email digests (weekly/monthly) `[web]` | Push-token mgmt stays internal |
| **Appearance** *(proposed 8th)* | Theme mode + palette `[both]`; Haptics `[iOS]` | Recommend its own group; alt: fold into Account |
| **Privacy & Security** | Product-analytics consent `[both]`; Art.9 consent (view/withdraw) `[both]`; Face ID + auto-lock `[iOS]`; Cookie preferences `[web]`; Download my data `[web → parity gap on iOS]`; Delete account `[both]` | "Your data" (export + delete) could be a sub-group here |
| **Integrations** | Calendar — outbound task sync + inbound Google `[both, split today]`; Process older entries (backfill) `[web]` | Consolidate the two calendar cards under one "Calendar" with clear in/out labels |
| **Help & About** | Replay product tour `[both]`; Send feedback `[iOS → parity gap on web]`; App version / about `[both, new]`; Support links `[both]` | |
| **Safety** | Crisis resources `[web → parity gap on iOS]` | Kept separate + visually prominent, NOT mixed with Help |

### Parity gaps surfaced (each needs a yes/no)
- **iOS missing:** Data export, Cookie prefs (N/A — no web cookies on native, so OK), Crisis resources, Referrals, Email digests, Life-Matrix dimensions.
- **web missing:** Send feedback, Face ID (N/A on web), Haptics (N/A), in-app subscribe (uses /upgrade — OK).
- Genuine gaps to close: **Data export on iOS**, **Crisis resources on iOS**, **Send feedback on web**, **Referrals/Email/Life-dimensions on iOS** (or accept these as web-only by design).

---

## 3. Navigation model

**Both platforms → Settings index (grouped rows) → sub-page per group.**
- **iOS:** extend the existing index→sub-screen pattern (it already has /security, /reminders, /privacy). Add sub-screens for the remaining groups; the Profile tab becomes a clean grouped index.
- **web:** replace the 16-section single scroll with either (a) **sub-routes** (`/account/subscription`, `/account/notifications`, …) matching iOS, or (b) grouped sections + a **synced, grouped** sub-nav. **Recommendation: sub-routes** — kills the long scroll, matches iOS, and the nav can't drift (it's the route list).

---

## 4. Before / after wireframes (rough)

```
iOS — BEFORE (one scroll)            iOS — AFTER (index → sub-pages)
┌─────────────────────────┐         ┌─────────────────────────┐
│ [avatar] Name · email   │         │ [avatar] Name · email   │
│ ◐ TRIAL — 9 days        │         │ ◐ TRIAL — 9 days        │
│ Subscribe ▸             │         │                         │
│ ── ACTIVITY ──          │         │ Account              ▸  │
│ Achievements ▸          │         │ Subscription         ▸  │
│ ── PREFERENCES ──       │         │ Notifications        ▸  │
│ Appearance card         │         │ Appearance           ▸  │
│ Haptics            [o]  │         │ Privacy & Security   ▸  │
│ Reminders ▸             │         │ Integrations         ▸  │
│ Replay tour ▸           │         │ Help & About         ▸  │
│ Security ▸              │         │ ⚠ Safety / Crisis    ▸  │  ← prominent
│ Calendar ▸              │         │ ── Achievements ▸ ──    │
│ Privacy ▸               │         │ Sign out                │
│ Connect Google Cal ▸    │         └─────────────────────────┘
│ ── SUPPORT ──           │            tap "Notifications" →
│ Send feedback ▸         │         ┌─────────────────────────┐
│ ── ACCOUNT ──           │         │ ‹ Notifications         │
│ Sign out / Delete       │         │ Reminders            ▸  │
└─────────────────────────┘         │ (Email digests*)        │
                                     └─────────────────────────┘

web — BEFORE                         web — AFTER
┌───────────┬───────────────┐        ┌───────────┬───────────────┐
│ sub-nav   │ 16 cards in    │        │ Account       │  <sub-page  │
│ (12, out  │ one long       │        │ Subscription  │   content   │
│  of sync) │ scroll:        │        │ Notifications │   for the   │
│  Profile  │  Profile       │        │ Appearance    │   selected  │
│  Sub      │  Trial         │        │ Privacy & Sec │   group>    │
│  Reminders│  Subscription  │        │ Integrations  │             │
│  …        │  Reminders     │        │ Help & About  │             │
│           │  Life dims     │        │ ⚠ Safety      │             │
│           │  Referrals     │        └───────────┴───────────────┘
│           │  … 16 total    │        grouped nav = route list
│           │  Delete        │        (always in sync); each item
└───────────┴───────────────┘        a /account/<group> sub-route
```

---

## 5. Time estimate

Assumes the grouped index → sub-page model, reusing existing sub-screens/components (most controls already exist — this is restructure + routing, not new features).

| Work | iOS | web |
|---|---|---|
| Settings index (grouped rows) | 0.5d | 0.5d |
| Sub-pages/routes per group (wire existing controls) | 1.0d | 1.5d (16 sections → ~8 routes) |
| Consolidations (2 calendar cards → 1; subscription rows → adaptive) | 0.5d | 0.5d |
| Sub-nav sync / removal (web) | — | 0.25d |
| Design-system polish + QA | 0.5d | 0.5d |
| **Subtotal (restructure only)** | **~2.5d** | **~3.25d** |

**Parity additions (optional, separate):** Send feedback on web ~0.5d · Crisis resources on iOS ~0.25d · Data export on iOS ~1d (needs the export to work on native) · Referrals/Email/Life-dims on iOS ~2–3d (real features, not just UI).

**Restructure-only total ≈ 6 days** (iOS + web). Full parity adds ~4–5d depending on which gaps you close.

---

## 6. Decisions (LOCKED 2026-06-07)
1. **Appearance** → ✅ its OWN group (the 8th group, as drafted). Theme mode + palette `[both]`, Haptics `[iOS]`.
2. **web navigation** → ✅ **sub-routes** (`/account/<group>`), matching iOS. Retire the long single-scroll + the hardcoded sub-nav.
3. **Parity gaps** → ✅ **defer ALL to a follow-up slice.** During restructure, keep current platform-specific behavior exactly as-is (no new features; don't add data-export to iOS, crisis to iOS, feedback to web, etc. yet). Just re-group what each platform already has.
4. **Name / email** → ✅ **Name editable; email read-only** (email change is its own auth-flow slice, out of scope here).
5. **Data export + Delete** → ✅ a **"Your data"** sub-group under **Privacy & Security**.
6. **Scope / sequencing** → ✅ **RESTRUCTURE-FIRST** (iOS + web together, ≈6d). Parity-gap closure = separate follow-up slice after restructure ships.

### What this means for the restructure slice
- 8 groups: Account · Subscription · Notifications · **Appearance** · Privacy & Security (with **"Your data"** sub-group: export + delete) · Integrations · Help & About · ⚠ Safety.
- iOS: extend index→sub-screen. web: index → **sub-routes** per group.
- **Pure re-grouping + routing of existing controls** — no new features, no parity additions, no behavior changes. A web-only section (referrals, email digests, life-dimensions, data export, cookie prefs) simply lands in its group on web and is absent on iOS (closed later in the parity slice).
- Account group: wire up **name editing** (the one net-new control); email stays read-only.

### Follow-up slice (after restructure ships) — parity gaps to revisit
Data export on iOS · Crisis resources on iOS · Send feedback on web · Referrals / Email digests / Life-Matrix dimensions on iOS (or formally accept as web-only).
