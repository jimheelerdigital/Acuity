import "server-only";

import { type Entitlement } from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/entitlements/resolve";

/**
 * SSR helper — fetch the User row + compute the entitlement for use
 * in server components. Companion to `requireEntitlement` (in
 * paywall.ts), which is for API routes that need a 402 response on
 * gate failure.
 *
 * Returns `null` when the userId can't be resolved to a User (stale
 * session, race with deletion). Callers treat null as "no
 * entitlement" — which the entitlementsFor partition treats the
 * same as FREE post-trial. Keeps server-component code thin: one
 * helper to import, no Prisma plumbing in every page.
 *
 * 2026-08-15: the Prisma read moved into lib/entitlements/resolve.ts so
 * there is exactly one place that decides WHERE subscription state comes
 * from (DB today, RevenueCat after cutover). Behavior is unchanged — the
 * resolver's default source performs the same select and calls the same
 * `entitlementsFor`.
 */
export async function getUserEntitlement(
  userId: string | null | undefined
): Promise<Entitlement | null> {
  const resolved = await resolveEntitlement(userId);
  return resolved?.entitlement ?? null;
}
