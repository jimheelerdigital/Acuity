# Tier structure — placeholder

**Status:** Document-only. No tier implementation lands pre-beta beyond the existing 4-value `subscriptionStatus` vocabulary (`TRIAL | PRO | FREE | PAST_DUE`) and the FeatureFlag.requiredTier column.

## Why this file exists

The pre-beta hardening pass (2026-04-21) seeded feature flags with `requiredTier` support so that when a real multi-tier offer launches, the lever is there. Today there is only one paid SKU — `PRO`. The `state_of_me_report` flag is the only one scoped to `requiredTier: "PRO"`; everything else is tier-agnostic.

This doc captures the open questions so the next person designing tiers doesn't have to re-derive them.

## Current vocabulary

`User.subscriptionStatus` (String, 4 canonical values enforced by app code):

| Value      | Meaning                                                                     |
|------------|-----------------------------------------------------------------------------|
| `TRIAL`    | Inside the 14-day free trial window (`trialEndsAt` future).                 |
| `PRO`      | Paying subscriber.                                                          |
| `FREE`     | Post-trial, not subscribed. Retains trial-history read access; no new outputs. |
| `PAST_DUE` | Stripe invoice failed; retries ongoing. Treated as PRO-access-grace until Stripe gives up. |

FeatureFlag.requiredTier accepts `"FREE" | "PRO" | null`:
- `null` — no tier gate. Available to anyone past the global `enabled=true` + rollout check.
- `"FREE"` — also grants to TRIAL users (the entitlement logic at `lib/feature-flags.ts::tierMatches` treats TRIAL + FREE as interchangeable for free-tier gating).
- `"PRO"` — only users with `subscriptionStatus = "PRO"`. PAST_DUE users currently fail this check by design — we accept that a grace-period power user momentarily loses PRO-only features during a failed invoice retry. Revisit if churn signal suggests otherwise.

## Open questions (post-beta)

1. **Is there a non-PRO paid tier (e.g. "PLUS", "LITE")?** Product hasn't committed. If yes, extend the vocabulary + tierMatches logic; add the new value to the Zod enum in `/api/admin/feature-flags/[id]/route.ts`.
2. **Team / family seats.** No schema support today. Would require a `Team` + `TeamMember` model with per-seat billing and a join on `User.teamId`. Stripe's customer portal supports this natively with a "manage members" toggle; we've left it disabled in `docs/STRIPE_PORTAL_SETUP.md`.
3. **Per-feature metering.** No usage counts are billed today — everything is flat-rate PRO. If metered usage becomes a SKU (e.g. "unlimited Ask-Your-Past-Self questions"), the `askPast` limiter's 10/day cap becomes a tier-specific value.
4. **Enterprise / SOC 2 tier.** Likely 2026 H2. `docs/SOC2_READINESS.md` captures the compliance prerequisites.
5. **Grandfathered pricing.** Product Brief + Personas say `$12.99`; Product Spec + Onboarding Spec say `$19`. Still an open decision (see PROGRESS.md). Whatever launches as the initial public price is what founding members lock in — language already baked into the waitlist drip emails (`apps/web/src/lib/drip-emails.ts`).

## When adding a new tier

1. Extend the FeatureFlag.requiredTier Zod enum in `/api/admin/feature-flags/[id]/route.ts`.
2. Update `lib/feature-flags.ts::tierMatches` to handle the new value against `User.subscriptionStatus`.
3. Update the UI dropdowns in `admin/tabs/FeatureFlagsTab.tsx` (both the flag row and the override form).
4. Plumb the new `subscriptionStatus` value through the Stripe webhook's mapping function (`apps/web/src/app/api/stripe/webhook/route.ts`).
5. Backfill existing users if the new tier has a free-start component (per-ToS migration email first).
6. Update `docs/TIER_STRUCTURE.md` (this file) with the new value + semantics.

No other file should hardcode tier strings. Grep first if you think there's a cross-reference — the feature-flag gate is supposed to be the single point of control.
