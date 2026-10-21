import "server-only";

import { headers } from "next/headers";
import { encode } from "next-auth/jwt";
import { appOnboardingCompleted } from "@/lib/app-onboarding";
import { loadWelcomeFields } from "@/lib/welcome-eligibility";

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
  /** "stripe" | "apple" | "google_play" — web trials count as onboarded (app-onboarding.ts). */
  subscriptionSource?: string | null;
  trialEndsAt?: Date | null;
  // Tour gates — surfaced so the mobile first-login tour trigger can
  // decide at sign-in instead of failing open on undefined (vc24 bug).
  // Optional: callers whose select omits them pass undefined, which the
  // response forwards faithfully (NOT 0/null) so the hardened gate waits
  // for /api/user/me rather than treating "unknown" as "eligible".
  totalRecordings?: number;
  tourCompletedAt?: Date | null;
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

  // "Got into the app" signal (2026-09-28): every app sign-in (password,
  // Google, Apple, magic link) passes through here. The admin funnel counts
  // it and the activation emails stop once it exists. Never blocks sign-in.
  try {
    const { prisma } = await import("@/lib/prisma");
    const installId = readInstallId();
    await prisma.onboardingEvent.create({
      data: { userId: user.id, event: "app_signed_in", sessionToken: installId },
    });
    if (installId) await backfillInstallEvents(prisma, user.id, installId);
  } catch {
    // analytics only
  }

  return { sessionToken, expiresAt };
}

/**
 * JSON shape returned to the mobile app on successful sign-in, shared
 * across Google OAuth (mobile-callback), password (mobile-login), and
 * magic-link (mobile-complete). Keeps the client's `User` type stable.
 */
export async function mobileSessionResponse(params: {
  sessionToken: string;
  expiresAt: string;
  user: MobileSessionUser;
}) {
  const { sessionToken, expiresAt, user } = params;
  // Funnel welcome flow (app 1.9+): sent at sign-in too, because nothing
  // calls /api/user/me right after a sign-in, and a fresh install is
  // exactly when a web buyer needs the welcome flow. Reads its own facts
  // (the callers' selects don't all include subscriptionSource).
  const welcome = await loadWelcomeFields(user.id);
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
      onboardingCompleted: appOnboardingCompleted(user.onboarding?.completedAt, user.subscriptionStatus, user.subscriptionSource),
      onboardingStep: user.onboarding?.currentStep ?? 1,
      // Tour gates. Forwarded faithfully: `undefined` (JSON-omitted) when
      // the caller's select didn't include them → the mobile gate treats
      // that as "not yet known" and waits for /api/user/me. A real value
      // (e.g. password login, which selects them) lets the gate decide
      // immediately and blocks the tour for existing users on fresh install.
      totalRecordings: user.totalRecordings,
      tourCompletedAt:
        user.tourCompletedAt === undefined
          ? undefined
          : user.tourCompletedAt
            ? user.tourCompletedAt.toISOString()
            : null,
      welcomeEligible: welcome.welcomeEligible,
      webDebriefEntryId: welcome.webDebriefEntryId,
      hasAiConsent: welcome.hasAiConsent,
    },
  };
}

// ── Install id (2026-10-20, Keenan) ─────────────────────────────────────
// App 1.9.5+ sends a stable per-install UUID as `X-Ripple-Install-Id` on
// every sign-in call, and as `sessionToken` on its v10_* / app_* onboarding
// events. Stamping it on app_signed_in and backfilling userId onto the
// install's earlier anonymous events turns the pre-sign-in funnel into
// per-person data. No schema change: OnboardingEvent.sessionToken (indexed).

const INSTALL_ID_RE = /^[0-9a-f-]{16,64}$/i;

/**
 * The install id from the current request, or null. Read via next/headers
 * so the five sign-in routes need no change; this function is only ever
 * called inside those route handlers. Outside a request it returns null.
 */
export function readInstallId(): string | null {
  try {
    const v = headers().get("x-ripple-install-id")?.trim() ?? "";
    return INSTALL_ID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

type BackfillDb = {
  user: { findUnique(args: { where: { id: string }; select: { productAnalyticsEnabled: true } }): Promise<{ productAnalyticsEnabled: boolean | null } | null> };
  onboardingEvent: {
    updateMany(args: {
      where: { sessionToken: string; userId: null; event: { startsWith: string } };
      data: { userId: string };
    }): Promise<{ count: number }>;
  };
};

/**
 * Attach this install's anonymous onboarding events to the user who just
 * signed in. Only rows with no user yet, and only the install-keyed
 * families (v10_*, app_*) — the id is never written on anything else, so
 * this can't touch web funnel rows. Skipped for someone who has opted out
 * of product analytics (the events route drops their signed-in events too).
 */
export async function backfillInstallEvents(
  db: BackfillDb,
  userId: string,
  installId: string
): Promise<number> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { productAnalyticsEnabled: true } });
  if (!u || u.productAnalyticsEnabled === false) return 0;
  let total = 0;
  for (const prefix of ["v10_", "app_"]) {
    const r = await db.onboardingEvent.updateMany({
      where: { sessionToken: installId, userId: null, event: { startsWith: prefix } },
      data: { userId },
    });
    total += r.count;
  }
  return total;
}
