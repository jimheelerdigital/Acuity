# PRO Tier — Post-Trial Feature Gating

**Status:** SPEC ONLY — not implemented. This document defines the gating contract for when PRO enforcement lands after the 14-day trial.
**Owner:** Jim (schedule) + Keenan (pricing + copy).
**Last updated:** 2026-04-21.

## The rule

Users get full access during the 14-day trial. PRO gating activates only after `trialEndsAt` passes and the user has not subscribed. Gated endpoints return 402 (paywall-redirect), gated routes render the paywall interstitial, and the existing `entitlements.ts` helper is the single source of truth — no gating check should live in a route handler outside that module.

See also:
- `apps/web/src/lib/entitlements.ts` — the evaluator (already tested, full-matrix Vitest suite per 2026-04-17 decisions).
- `apps/web/src/components/paywall-redirect.tsx` — the web interstitial component.
- `apps/mobile/app/paywall.tsx` — the mobile modal.

## Gated post-trial (PRO required)

All of the below should be wrapped in entitlement checks at the route/handler level. Trial users (14-day window) + PRO subscribers get access; free-tier post-trial users get a 402 / paywall interstitial.

| Feature | Surface | Endpoint / Route | Notes |
|---|---|---|---|
| **State of Me Report** — scheduled 90-day and on-demand generation | Web + mobile | `POST /api/insights/state-of-me`; mobile + web `/insights/state-of-me` | Quarterly Inngest run skips non-PRO users. On-demand button returns 402 and routes to `/upgrade?src=state_of_me`. |
| **Apple Health integration** | Mobile client + server | Mobile HealthKit uploader + `POST /api/health/snapshot` | Currently deferred (no client ships yet). When client ships, require PRO for upload. Server-side tables already exist. |
| **Ask Your Past Self** | Web + mobile | `POST /api/insights/ask` | Free tier: 3 queries / month OR 1 / week — final rate TBD. Rate-limited per user with a soft counter in `UserFeatureQuota`. |
| **Data Export** | Web | `POST /api/account/export` | Already wired through entitlements for the trigger; deferring the paywall gate until launch. |
| **Custom Life Matrix dimensions beyond 6** | Web + mobile account screen | `POST /api/account/life-dimensions` | Free tier: 6 default dimensions only. Adding a 7th+ requires PRO. Free users can still disable defaults (zero dimensions is allowed). |
| **Theme Evolution Map** | Web + mobile | `/insights/theme-map` | TBD — verify via Keenan whether this is worth gating vs. keeping free as a hook. Current lean: **free** (it's what makes the app feel alive post-trial). Revisit after first 30 days of conversion data. |

## Always free (never gate these)

| Feature | Why free |
|---|---|
| **Core recording + transcription + extraction** | This IS the product. Gating the primitive kills retention. |
| **Life Matrix (default 6 dimensions)** | Same reasoning. The radar + scoring loop is the 60-second nightly ritual. |
| **Goals + Tasks** | Basic productivity surface. Gating these feels punitive. |
| **Weekly digest email** | Retention mechanism. Free users stay engaged and convert over time. |
| **Monthly digest email** | Same. Free users who stop recording still get a monthly reflection email. |
| **Referral rewards** | Drives virality. Every gate on this channel reduces the referral funnel. |
| **Claude auto-observations** | First 1-2 per week free. Soft limit after that — NOT a hard paywall. Keeps the "Acuity notices things about you" magic moment accessible. Final per-week count TBD. |

## Trial-expiry behavior (already shipped — reference only)

Per 2026-04-17 decisions, the trial-to-paid transition is a **soft** transition, not a cliff:

- **Day 14 Life Audit** is the emotional anchor — users arrive at Day 14 already holding a long-form audit of their trial. (Generation shipped; completion email deferred — see PROGRESS.md 2026-04-21 audit notes.)
- **Weekly reports after trial expiry** stop generating. Strict rule (Option A, 2026-04-17). No grace window.
- **Tasks + goals post-trial** remain PATCH-able. No new ones born without a new recording.
- **Mood + Life Matrix charts** get a ghost-state annotation at `trialEndsAt` ("Trial ended — new entries resume with subscription"); muted tail continues rather than silent gaps.
- **Life Map refresh** button stays visually enabled — tap opens a "Month 2 lives here" interstitial → `/upgrade?src=lifemap_interstitial`. (Override of original Claude Code recommendation which said to disable the button; Jim's call — "greyed-out button is passive guilt that sits forever; tap-to-interstitial converts on intent.")

## What NOT to implement yet

- Do **not** add new gating checks to routes or UI in this pass.
- Do **not** modify `entitlements.ts`.
- Do **not** change the `/upgrade` page or Stripe checkout flow.
- Do **not** ship Theme Map gating — defer the call until post-launch conversion data.

This document is the contract. When the product-side decision lands to flip PRO gating on, the implementation is: wrap each gated endpoint in `requirePaidOrTrial(userId)` (lives in entitlements.ts), add 402 handling on the client, and surface the paywall copy + CTA.

## Open questions for Keenan

1. **Ask Your Past Self free-tier rate** — 3/month or 1/week? 3/month feels tighter (encourages upgrade); 1/week feels more generous but leaves more free-value on the table.
2. **Theme Map** — gate or keep free? Recommendation: free for launch, revisit 30 days in.
3. **Claude observations per week on free tier** — 1 or 2? 2 is more engaging; 1 is cheaper for us.
4. **Post-trial email copy** — who owns the "your trial ended, here's what PRO unlocks" email draft? Jim's deferred tracker has this pending.
