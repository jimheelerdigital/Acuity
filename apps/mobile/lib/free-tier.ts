/**
 * Mobile-side helper to detect FREE post-trial users.
 *
 * Mirrors `entitlementsFor` from `apps/web/src/lib/entitlements.ts`
 * (which can't be imported here — it's behind `import "server-only"`).
 * Match the same partition rules so a user labeled FREE on the web
 * shows the FREE locked-state surfaces on mobile too:
 *
 *   - PRO        → not free
 *   - PAST_DUE   → not free (Stripe grace window)
 *   - TRIAL with trialEndsAt > now (or null)  → not free (trialing)
 *   - everything else (FREE, expired TRIAL, CANCELED, unknown) → free
 *
 * Lives in mobile only because the web equivalent already exists in
 * the SSR helper `entitlements-fetch.ts`. A future refactor could
 * move the partition function into `@acuity/shared`; out of scope
 * for slice 4-mobile.
 */
export function isFreeTierUser(
  user: {
    subscriptionStatus?: string | null;
    trialEndsAt?: string | null;
  } | null
  | undefined,
  now: Date = new Date()
): boolean {
  if (!user) return true; // logged-out / stale session = treat as free
  const status = user.subscriptionStatus ?? "";
  if (status === "PRO" || status === "PAST_DUE") return false;
  if (status === "TRIAL") {
    if (!user.trialEndsAt) return false;
    const ends = new Date(user.trialEndsAt).getTime();
    if (!Number.isFinite(ends)) return false;
    return ends <= now.getTime();
  }
  return true;
}
