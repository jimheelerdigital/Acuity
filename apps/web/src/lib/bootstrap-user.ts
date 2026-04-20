import "server-only";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

/**
 * One-time bootstrap for a newly-created User row. Writes the trial
 * clock, seeds the Life Matrix, creates the empty UserMemory, and
 * fires the trial_started PostHog event.
 *
 * Called from two places:
 *
 *  1. `events.createUser` in apps/web/src/lib/auth.ts — fires when
 *     NextAuth's PrismaAdapter creates a User through the web's
 *     magic-link or Google-OAuth-via-callback flow.
 *
 *  2. `POST /api/auth/mobile-callback` — fires when the mobile app's
 *     native Google OAuth flow lands an unknown Google identity. The
 *     mobile path bypasses NextAuth's adapter (we create the User row
 *     directly so we can issue a native JWT in the same roundtrip)
 *     which means the `events.createUser` hook never fires for mobile
 *     signups. Calling this helper restores parity.
 *
 * Idempotent on LifeMapArea + UserMemory — both use createMany /
 * create with catch-swallow so a re-run against an existing user is
 * a no-op. `trialEndsAt` is always overwritten from now (only called
 * at first-signup, never re-called, but if we ever do we want the
 * clock to re-seed rather than leak an ancient trial date).
 *
 * IMPLEMENTATION_PLAN_PAYWALL §1.6 + §8.3.
 */
export async function bootstrapNewUser(params: {
  userId: string;
  email: string | null;
}): Promise<void> {
  const { userId, email } = params;
  const { prisma } = await import("@/lib/prisma");
  const { track } = await import("@/lib/posthog");

  const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
  const trialEndsAt = new Date(Date.now() + TRIAL_MS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "TRIAL",
      trialEndsAt,
    },
  });

  await track(userId, "trial_started", {
    trialEndsAt: trialEndsAt.toISOString(),
    email,
  });

  await prisma.lifeMapArea
    .createMany({
      data: DEFAULT_LIFE_AREAS.map((area, index) => ({
        userId,
        area: area.enum,
        name: area.name,
        color: area.color,
        icon: area.icon,
        sortOrder: index,
      })),
      skipDuplicates: true,
    })
    .catch(() => {
      // Second-call idempotency — unique constraint (userId, area) should
      // throw, not collapse. Swallowed so a bootstrap re-run is safe.
    });

  await prisma.userMemory
    .create({
      data: { userId },
    })
    .catch(() => {
      // Ignore if already exists (UserMemory has a unique userId).
    });
}
