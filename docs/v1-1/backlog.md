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

## (Future entries land here as they emerge.)
