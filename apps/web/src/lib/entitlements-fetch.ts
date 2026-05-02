import "server-only";

import { entitlementsFor, type Entitlement } from "@/lib/entitlements";

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
 */
export async function getUserEntitlement(
  userId: string | null | undefined
): Promise<Entitlement | null> {
  if (!userId) return null;
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  if (!user) return null;
  return entitlementsFor(user);
}
