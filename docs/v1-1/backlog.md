# v1.1 Backlog

Small tracked items that don't fit cleanly inside an active slice. Pull off the top when you have spare cycles.

---

## Test mock — `deletedUser` missing in `auth-flows.test.ts`

**Status:** RESOLVED in slice 7 (commit `c276175`, 2026-05-02).

**Resolution:** Changed all 5 `prisma.deletedUser.findUnique` mocks to `findFirst` to match `bootstrap-user.ts:245`. The 5th mock (casing-normalization test) was additionally updated for the `where: { email: { in: [...] } }` shape introduced when canonical-vs-literal email candidates landed.

**Outcome:** all 4 baseline-red failures cleared. Full apps/web vitest is now 284/284 green.

---

## Mobile React 18/19 type collision on memoized components

**Status:** Outstanding. Diagnosis upgraded 2026-05-02 — root cause is workspace-wide, not local to apps/mobile. Requires deeper refactor; not blocking.

**Symptom:** `apps/mobile` `npx tsc --noEmit` reports ~115 TS2786 errors of the shape:

```
'X' cannot be used as a JSX component.
  Its type 'Provider<...>' is not a valid JSX element type.
    Type 'bigint' is not assignable to type 'ReactNode'.
```

Affected components are existing `memo()`-wrapped or context-provider-wrapped exports across the mobile codebase: `TreeNode` (goals), `TaskLeaf`, `EntryRow` (home), `GroupSection`, `TaskRow` (tasks), plus `AuthContext.Provider` and `ThemeContext.Provider`.

**Cause (confirmed 2026-05-02 via `npm ls @types/react`):** the workspace pins different `@types/react` versions for web vs mobile:

| Package        | `@types/react` declared | Reason                              |
|----------------|--------------------------|-------------------------------------|
| `apps/web`     | `^18.3.0`                | Next.js 14 era (current)            |
| `apps/mobile`  | `~19.1.0`                | Expo SDK 54 / React 19 (required)   |

Top-level npm hoists only one of them — observed: `@types/react@19.1.17` at workspace root, plus `@types/react@18.3.28` deduped under multiple `@radix-ui/react-*` transitive deps that come in via `expo-router`. `npm ls` reports them as `deduped invalid: "^19.1.0" from node_modules/react-native` — peer-resolution failure that npm tolerates but tsc surfaces as TS2786 because `ReactNode` differs between versions (React 19 added `bigint`).

**Why no runtime impact:** Babel/Metro accept any React-element shape; the runtime doesn't care which `@types/react` computed the JSX type. Web build uses `next.config.js typescript.ignoreBuildErrors: true`. Mobile build uses Metro and never runs tsc as a gate. Neither bundler fails.

**Fix candidates, in increasing scope:**

1. **Per-workspace `overrides` (npm 10+).** Cannot solve this — npm `overrides` is global; you can't say "use 19.1 in mobile, 18.3 in web." Forcing one version breaks the other.

2. **Migrate workspace to pnpm.** pnpm supports `nohoist` semantics + per-package `node_modules/.pnpm/*` isolation. Each package would resolve its own `@types/react`. Cost: rewrite all install/CI/EAS hooks; revisit `@acuity/shared` resolution. Estimate: 1-2 day pass.

3. **Upgrade web to React 19 + Next.js 15.** Brings web's `@types/react` to `~19.1.0` and aligns the workspace to one version. Then both packages share types cleanly. Cost: Next.js 15 has breaking changes (App Router conventions evolved, fonts API changes, `headers()` is async). Estimate: 1-2 day pass + production smoke. Higher risk than option 2 because runtime semantics change.

4. **`skipLibCheck: true` in mobile tsconfig.** Already enabled — confirmed via `apps/mobile/tsconfig.json`. Doesn't suppress TS2786 because the JSX-element conformance check runs against your own components, not lib types.

5. **`@ts-expect-error` per call site.** ~115 sites; suppresses but doesn't fix; future-toxic.

**Recommended path:** Option 2 (pnpm migration) when there's a contiguous workspace-tooling pass. Until then, the type errors are noise that doesn't gate any build, and the per-slice protocol step 6 (typecheck owns whole working tree) explicitly lets us call out unrelated baseline tsc errors as long as none look runtime-fatal.

**Why backlog and not blocked:** type-only, build is green, runtime works. Cleanup candidate for a workspace-tooling pass; not gating any slice.

---

## isFreeTierUser duplicates FREE-partition logic from entitlements.ts

**Status:** RESOLVED in slice 7 (commit `c276175`, 2026-05-02).

**Resolution:** Moved the FREE-partition predicate to `packages/shared/src/free-tier.ts`. `apps/mobile/lib/free-tier.ts` is now a thin re-export. Web/server `entitlements.ts` retains its full `Entitlement` object; the boolean shorthand is shared. Test coverage in `apps/web/src/lib/free-tier-shared.test.ts` (11 tests).

**Outcome:** single source of truth. Mobile and web (client) both call `isFreeTierUser` from `@acuity/shared`. The partition rule cannot drift across platforms.

---

## tsc baseline on apps/web — 7 errors across 4 files

**Status:** Surfaced as a sweep finding 2026-05-02. Not blocking any slice.

**Files:**
- `src/app/admin/tabs/OverviewTab.tsx` — 4 errors (3 `blendedCac` property access on a type that doesn't include it; 1 `BarRectangleItem` vs `{ date?: string }` mismatch on a Recharts handler).
- `src/components/landing.tsx` — 1 error (a stat-array literal where one entry omits `prefix` while the type is the union of both shapes).
- `src/inngest/functions/auto-blog.ts` — 1 error (`PrismaClient` mistyped against a narrower local `tx` shape — pre-existing param typing drift).
- `src/lib/google/auth.ts` — 1 error (call signature mismatch — passing 4 args to a 0-1 arg fn; needs investigation).

**Why backlog:** none of these match the C4 invalid-SDK-signature pattern (the runtime-fatal failure mode flagged by slice protocol step 6). Each is either an admin-only path (OverviewTab), a marketing surface that ships fine through `ignoreBuildErrors` (landing.tsx), an Inngest fn that has been running in production (auto-blog.ts), or a library wrapper with an unused arg (google/auth.ts). Stable since slice 6's verification entry.

**Action when picked up:** open a small branch per file. None require schema changes.

---

## Reviewer-account verification gap (v1.1)

**Status:** New 2026-05-02. Not gating; surfaced during W1 sweep.

**Symptom:** the v1.1 `seed-v11-reviewer.ts` script (and the v1.0 one before it) seeds the database but doesn't include a verification side-script that checks the seeded shape lines up with the FREE-tier locked-state UX in production. A subtle schema drift — e.g. a future column rename — could result in a seed that runs clean but produces a row that the UI doesn't render correctly.

**Action when picked up:** add `apps/web/scripts/check-reviewer-state.ts` that takes `--email`, fetches the User row, computes `entitlementsFor(user)`, and prints a green/red summary against the expected matrix:
- `subscriptionStatus == "FREE"`
- `trialEndsAt` < now
- `entitlement.canRecord == true`
- `entitlement.canExtractEntries == false`
- entry count, theme count, life-area count match the seed's expectations.

Same approach as the existing slice 2 persona verifier (`apps/web/scripts/verify-slice2-recording.ts`). Estimate: 30 minutes.

**Why backlog:** the seed scripts are short and read-pass during their own runs (`Row counts: …` log at the end), so a manual eyeball is sufficient for v1.1. A formal verifier is a luxury, not a requirement.

---

## V5 cohort attribution gap (no `Entry.themePromptVersion`)

**Status:** New 2026-05-02. Surfaced during the V5 day-1 soak attempt.

**Symptom:** the schema does not record which extraction prompt version produced an Entry. `Entry`, `Theme`, `ThemeMention` have no `promptVersion` / `themePromptVersion` / `extractionVersion` field. The `feature-flags::isEnabled` layer decides at runtime whether the V5 dispositional prompt or the legacy prompt fires for a given extraction, but doesn't persist a fingerprint.

**Impact:** **measurement is impossible.** `apps/web/scripts/theme-distribution.ts` cannot split V5 vs legacy cohorts from production data. So the day-1 soak attempt could not produce the comparison the ramp gating was designed to use. The flag is currently HELD at 12% pending this fix (see `docs/v1-1/v5-soak-day1.md`).

**Fix path:**
1. Add `Entry.themePromptVersion String?` column (or an enum if we decide enum-ification is worth it).
2. Pipeline writes `themePromptVersion: isV5Enabled ? "v5_dispositional" : "v0_legacy"` at extraction-persist time.
3. Backfill all historical entries to `"v0_legacy"` (single SQL `UPDATE Entry SET themePromptVersion = 'v0_legacy' WHERE themePromptVersion IS NULL` after db push).
4. Extend `theme-distribution.ts` with `--cohort=v5_dispositional|v0_legacy|both` filter; default to a side-by-side report.

**Estimate:** 30 min code + Jim's home-network db push + 30 min script. ~2 hours end-to-end.

**Why backlog:** the V5 ramp is currently HELD at 12%, so the immediate decision (don't bump, don't rollback) is unblocked. The fix is needed before the NEXT ramp decision (25% bump or 0% rollback). Until either of those decisions is forced, this isn't urgent.

---

## Stripe webhook: handle `charge.refunded`

**Status:** New 2026-05-04 (W2 sweep). Spec'd, not implemented.

**Origin:** docs/v1-1/stripe-webhook-audit.md §4.5. Apple is fine — the gap is on the Stripe side.

**Symptom:** when Stripe issues a refund without the user also canceling the subscription, our webhook is a no-op (default branch in `apps/web/src/app/api/stripe/webhook/route.ts`). The user's `subscriptionStatus` stays `PRO` even though the payment was returned. They keep access for the rest of the period at no cost.

**Spec:**
- New `case "charge.refunded":` in the dispatcher.
- Read `charge.customer` (string) and `charge.refunded` (bool) and the `charge.payment_intent` (string).
- Look up the User by `stripeCustomerId` with the FREE-guard pattern (`subscriptionStatus: { not: "FREE" }`) — same shape as the W-A §4.4 fix so a stale event for a canceled user is a no-op.
- Decision: full refund AND `charge.payment_intent` matches the most recent invoice that activated the subscription → flip `subscriptionStatus = "FREE"`, null `stripeSubscriptionId` and `stripeCurrentPeriodEnd`. Send a (best-effort) email letting them know access ends.
- Decision: partial refund OR refund of an old invoice → log only, don't touch state. Stripe issues partial refunds for various adjustments; we don't want to terminate access on a $0.50 fee correction.
- Idempotency-protected by the existing `StripeEvent.id` tombstone at the dispatcher.

**Why backlog and not blocked:** refunds are rare (manual customer-service request) and we'd usually pair the refund with a manual cancel anyway. The risk is a customer-service rep refunds without canceling, the user gets a free month. Acceptable until refund volume increases.

**Estimate:** 30 min code + 30 min tests. ~1 hour end-to-end.

---

## Stripe webhook: handle `customer.deleted`

**Status:** New 2026-05-04 (W2 sweep). Spec'd, not implemented.

**Origin:** docs/v1-1/stripe-webhook-audit.md §4.7.

**Symptom:** when a Stripe Customer is deleted (admin action in dashboard), our `User.stripeCustomerId` stays as the orphaned ID. Next checkout attempt would try to use the deleted customer ID and fail at the Stripe API call, returning a confusing error to the user.

**Spec:**
- New `case "customer.deleted":` in the dispatcher.
- Read `customer.id`.
- `prisma.user.updateMany({ where: { stripeCustomerId: id }, data: { stripeCustomerId: null, stripeSubscriptionId: null, stripeCurrentPeriodEnd: null, subscriptionStatus: existing === "PRO" ? "FREE" : existing } })` — null the customer link, downgrade if active. The W-A FREE-guard isn't needed here because going FROM any state TO FREE is fine (terminal direction).
- New checkout will create a fresh customer when the user re-subscribes.

**Why backlog:** Stripe customer deletion is exceptionally rare in production. Currently no automation triggers it; only manual dashboard action. A user landing on `/upgrade` post-deletion would just create a fresh checkout flow, slightly slower than the cached-customer path but functionally fine.

**Estimate:** 20 min code + 20 min tests. ~40 min.

---

## (Future entries land here as they emerge.)
