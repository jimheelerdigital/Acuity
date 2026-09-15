import { api } from "@/lib/api";
import {
  clearStoredTrySession,
  getStoredTrySessionToken,
} from "@/lib/try-session";

/**
 * Claim the anonymous first debrief onto a real account.
 *
 * ── Why this is its own module ───────────────────────────────────────
 * Spec §4 Screen 7: "Claim of anonymous entry + entitlement is idempotent;
 * failure never discards either." Two properties, and both are easy to
 * break by accident in a screen component:
 *
 * 1. IDEMPOTENT — the user may sign in, background the app mid-request,
 *    reopen and sign in again. A second claim must not create a second
 *    Entry, and must not error out the flow if the first one already
 *    landed. The server keys on the single-use sessionToken, so a replay
 *    is a no-op there; this function's job is to not *lose* the token
 *    until the server has confirmed it consumed it.
 *
 * 2. NEVER DISCARDS — the local token is cleared ONLY after a success. A
 *    naive `finally { clear() }` would throw away the user's first debrief
 *    the moment the network hiccuped, and there is no way to get it back:
 *    the audio is anonymous and the token is the only handle on it.
 *
 * Entitlement claim is deliberately NOT here. RevenueCat aliasing happens
 * in auth-context.tsx on sign-in (`Purchases.logIn(user.id)`), which is
 * already idempotent by RC's own contract and runs for every auth path,
 * not just v10. Duplicating it here would mean two places to keep correct.
 */

export type ClaimOutcome =
  | { status: "claimed"; entryId?: string }
  | { status: "nothing_to_claim" }
  | { status: "failed"; retryable: true; error: string };

/**
 * Attach the stored anonymous debrief to the now-authenticated user.
 *
 * Safe to call more than once, and safe to call when there is nothing to
 * claim. Never throws — the caller is a signup flow, and a claim failure
 * must not block a user who has just successfully created an account.
 */
export async function claimAnonymousDebrief(): Promise<ClaimOutcome> {
  const sessionToken = await getStoredTrySessionToken();
  if (!sessionToken) return { status: "nothing_to_claim" };

  try {
    const res = await api.post<{ ok: boolean; entryId?: string }>(
      "/api/try-recording/claim",
      { sessionToken }
    );
    // Cleared only on confirmed success — see property 2 above.
    await clearStoredTrySession();
    return { status: "claimed", entryId: res?.entryId };
  } catch (err) {
    return {
      status: "failed",
      retryable: true,
      error: err instanceof Error ? err.message : "Claim failed",
    };
  }
}
