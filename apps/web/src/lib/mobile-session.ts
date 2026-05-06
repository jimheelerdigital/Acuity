import "server-only";

import { encode } from "next-auth/jwt";

/**
 * Shared NextAuth-JWT minter for mobile-side sign-in endpoints
 * (mobile-callback, mobile-login, mobile-magic-link complete). All
 * three paths produce identical token shape + lifetime so the mobile
 * app doesn't need to branch on how the user signed in.
 *
 * The payload mirrors the web session's JWT — `token.id` + `sub` =
 * user id — so server-side helpers like `getAnySessionUserId()`
 * decode both surfaces uniformly.
 */

export const MOBILE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type MobileSessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | null;
  // Onboarding flags — flattened into the response below so the
  // mobile AuthGate (apps/mobile/app/_layout.tsx) can route the
  // user to /(tabs) vs /onboarding immediately after sign-in.
  // Without these, `setAuthenticatedUser(result.user)` in the
  // post-OAuth fix (commit 8c2734a) leaves `onboardingCompleted`
  // undefined → `!undefined` is true → existing users get routed
  // through onboarding. Surfaced 2026-05-05 when Jim's preview
  // build dropped him into the onboarding flow despite his
  // 2026-04-20 completion.
  //
  // Accepts the raw Prisma relation shape to keep call sites
  // simple — they just add `onboarding: { select: { completedAt:
  // true, currentStep: true } }` to their existing select.
  onboarding?: {
    completedAt: Date | null;
    currentStep: number;
  } | null;
};

export async function issueMobileSessionToken(
  user: MobileSessionUser
): Promise<{ sessionToken: string; expiresAt: string }> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET unset — cannot issue mobile session");
  }

  const sessionToken = await encode({
    token: {
      id: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
    },
    secret,
    maxAge: MOBILE_SESSION_MAX_AGE_SECONDS,
  });

  const expiresAt = new Date(
    Date.now() + MOBILE_SESSION_MAX_AGE_SECONDS * 1000
  ).toISOString();

  return { sessionToken, expiresAt };
}

/**
 * JSON shape returned to the mobile app on successful sign-in, shared
 * across Google OAuth (mobile-callback), password (mobile-login), and
 * magic-link (mobile-complete). Keeps the client's `User` type stable.
 */
export function mobileSessionResponse(params: {
  sessionToken: string;
  expiresAt: string;
  user: MobileSessionUser;
}) {
  const { sessionToken, expiresAt, user } = params;
  return {
    sessionToken,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      subscriptionStatus: user.subscriptionStatus ?? null,
      trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
      // Match the flat shape /api/user/me returns so mobile's
      // AuthGate routes existing users past onboarding correctly.
      onboardingCompleted: Boolean(user.onboarding?.completedAt),
      onboardingStep: user.onboarding?.currentStep ?? 1,
    },
  };
}
