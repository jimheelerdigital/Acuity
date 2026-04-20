import "server-only";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

/**
 * One-time bootstrap for a newly-created User row. Writes the trial
 * clock, seeds the Life Matrix, creates the empty UserMemory, and
 * fires the trial_started PostHog event.
 *
 * Called from every signup path — web Google OAuth (via NextAuth
 * events.createUser), web email/password, web magic link, mobile
 * Google OAuth, mobile email/password, mobile magic link. Single
 * chokepoint for trial issuance means the retention policy below
 * applies uniformly.
 *
 * Trial-reset protection (pentest T-07 / docs/SECURITY_AUDIT.md F-24):
 * Before setting trialEndsAt we consult the DeletedUser table. Users
 * who deleted their account recently get a shorter "welcome back"
 * trial instead of another full 14 days, to prevent farming fresh
 * trials via delete+recreate cycles.
 *
 * Retention policy:
 *   - Never seen           → 14-day trial (first-timer; most users)
 *   - Deleted > 90d ago    → 14-day trial (welcome back, genuine return)
 *   - Deleted ≤ 90d ago    → 3-day trial (clearly hopping)
 *
 * Idempotent on LifeMapArea + UserMemory — both use createMany /
 * create with catch-swallow so a re-run against an existing user is
 * a no-op.
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

  const trialDays = await trialDaysForEmail(email);
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "TRIAL",
      trialEndsAt,
    },
  });

  await track(userId, "trial_started", {
    trialEndsAt: trialEndsAt.toISOString(),
    trialDays,
    reducedTrial: trialDays < 14,
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

/**
 * Determine how many trial days to issue based on DeletedUser history.
 * Exported separately so the (rare) admin-side flows + any future
 * signup paths that don't go through bootstrapNewUser can share it.
 */
export async function trialDaysForEmail(
  email: string | null
): Promise<number> {
  const STANDARD_TRIAL_DAYS = 14;
  const REDUCED_TRIAL_DAYS = 3;
  const LOOKBACK_DAYS = 90;

  if (!email) return STANDARD_TRIAL_DAYS;

  const { prisma } = await import("@/lib/prisma");
  const normalized = email.toLowerCase().trim();
  const deleted = await prisma.deletedUser.findUnique({
    where: { email: normalized },
  });
  if (!deleted) return STANDARD_TRIAL_DAYS;

  const daysSince =
    (Date.now() - deleted.deletedAt.getTime()) / (24 * 60 * 60 * 1000);
  return daysSince < LOOKBACK_DAYS ? REDUCED_TRIAL_DAYS : STANDARD_TRIAL_DAYS;
}
