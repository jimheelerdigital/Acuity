/**
 * FREE-tier partition predicate. Single source of truth shared
 * between web (server + client) and mobile so the gate cannot
 * drift across platforms.
 *
 * Mirrors the partition rule in
 * `apps/web/src/lib/entitlements.ts::entitlementsFor`:
 *
 *   - PRO        → not free (active paid)
 *   - PAST_DUE   → not free (Stripe grace window)
 *   - TRIAL with trialEndsAt > now (or null) → not free (trialing)
 *   - everything else (FREE, expired TRIAL, CANCELED, unknown) → free
 *
 * Why a parallel helper to `entitlementsFor`? `entitlementsFor`
 * lives behind `import "server-only"` in apps/web. Mobile + client
 * components need a barrier-free predicate, and the partition rule
 * is small enough that duplicating the full Entitlement object on
 * both sides would be heavier than just sharing this boolean.
 *
 * Accepts both Date (server) and ISO string (client/mobile) for
 * `trialEndsAt` because the boundary between server payloads and
 * client state usually serializes Dates as strings — supporting
 * both keeps callers from having to remember which form they have.
 */
export interface FreeTierUserShape {
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | string | null;
}

export function isFreeTierUser(
  user: FreeTierUserShape | null | undefined,
  now: Date = new Date()
): boolean {
  if (!user) return true; // logged-out / stale session = treat as free
  const status = user.subscriptionStatus ?? "";
  if (status === "PRO" || status === "PAST_DUE") return false;
  if (status === "TRIAL") {
    if (!user.trialEndsAt) return false;
    const endsMs =
      user.trialEndsAt instanceof Date
        ? user.trialEndsAt.getTime()
        : new Date(user.trialEndsAt).getTime();
    if (!Number.isFinite(endsMs)) return false;
    return endsMs <= now.getTime();
  }
  return true;
}
