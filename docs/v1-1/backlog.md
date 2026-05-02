# v1.1 Backlog

Small tracked items that don't fit cleanly inside an active slice. Pull off the top when you have spare cycles.

---

## Test mock — `deletedUser` missing in `auth-flows.test.ts`

**Status:** Pre-existing, baseline-red. Not introduced by any v1.1 slice.

**Symptom:** Full `apps/web` vitest run shows 4 failures in `src/tests/auth-flows.test.ts > trialDaysForEmail`, all with the same shape:

```
TypeError: prisma.deletedUser.findFirst is not a function
 ❯ trialDaysForEmail src/lib/bootstrap-user.ts:245:44
```

**Cause:** `bootstrap-user.ts:trialDaysForEmail` calls `prisma.deletedUser.findFirst({...})` to look up tombstoned accounts (pentest T-07 reduced-trial logic). The Prisma mock at the top of `auth-flows.test.ts` doesn't include a `deletedUser` model, so the call resolves to `undefined.findFirst` → TypeError.

**Fix:** add `deletedUser: { findFirst: vi.fn().mockResolvedValue(null) }` to the prisma mock object in `apps/web/src/tests/auth-flows.test.ts`. Per-test overrides via `findFirst.mockResolvedValueOnce(...)` for the cases that need a tombstone present.

**Why backlog and not blocked:** every active slice (free-tier 1+2, theme V5, calendar C1+C2) has run the full vitest sweep and confirmed these 4 failures are baseline. They're noise in the signal, not a regression vector. Fixing it is ~10 minutes of work but doesn't gate anything.

**Impact if left:** new contributors run vitest, see 4 reds, lose ~5 min figuring out it's pre-existing. Each slice's "tests pass" gate has to explicitly call out the same 4 unrelated failures, which is grit in the protocol.

---

## Mobile React 18/19 type collision on memoized components

**Status:** Pre-existing, type-only, no runtime impact. Visible since at least slice 4-mobile.

**Symptom:** `apps/mobile` `npx tsc --noEmit` reports ~115 TS2786 errors of the shape:

```
'X' cannot be used as a JSX component.
  Its type 'Provider<...>' is not a valid JSX element type.
    Type 'bigint' is not assignable to type 'ReactNode'.
```

Affected components are existing `memo()`-wrapped or context-provider-wrapped exports across the mobile codebase: `TreeNode` (goals), `TaskLeaf`, `EntryRow` (home), `GroupSection`, `TaskRow` (tasks), plus `AuthContext.Provider` and `ThemeContext.Provider`.

**Cause:** apps/mobile installs `react@19.1.0` (Expo SDK 54 requirement) but `@types/react` resolves to a version that includes `bigint` in `ReactNode`, while the mobile app's compiled types still resolve some leaf imports to React 18's `@types/react` from elsewhere in the workspace. Babel/Metro accept both shapes at runtime; tsc's structural-equivalence check fails on the `bigint` divergence.

**Why no runtime impact:** `next.config.js`/Expo config don't run tsc as a build gate, and the JSX runtime accepts the same component instances regardless of which `@types/react` version computed the type. The build ships fine.

**Fix candidates:**
- Pin `@types/react` and `@types/react-native` consistently across apps/mobile and the workspace root.
- Or upgrade everything (web + mobile + shared) to the React 19 type definitions in lockstep.

**Why backlog:** type-only, build is green, runtime works. Cleanup candidate when there's a contiguous mobile-types pass; not gating any slice.

---

## isFreeTierUser duplicates FREE-partition logic from entitlements.ts

**Status:** Intentional duplication landed in slice 4-mobile (commit `6ae855d`). Future refactor candidate.

**Symptom:** Two implementations of the FREE-side subscription partition rule:
- `apps/web/src/lib/entitlements.ts:entitlementsFor` — full Entitlement object, all `can*` flags
- `apps/mobile/lib/free-tier.ts:isFreeTierUser` — boolean only, "is this user FREE post-trial?"

If the partition rule changes (e.g. add a new subscription status, change the trialEndsAt evaluation), both files must update in lockstep.

**Cause:** `entitlements.ts` is `import "server-only"` and lives in apps/web — can't be imported from mobile. Slice 4-mobile inlined the FREE-side partition into a 37-line mobile helper rather than refactor mid-slice.

**Fix:** move the partition logic into `@acuity/shared` (drop the `server-only` import; the function is pure with no I/O). Web then re-exports from there; mobile imports the same function. One source of truth.

**Why backlog:** functional today; partition logic is stable (the rule hasn't changed since slice 1 of the free-tier redesign); refactor is ~20 minutes of work plus a testing pass to confirm no behavioral drift.

---

## (Future entries land here as they emerge.)
