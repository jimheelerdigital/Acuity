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
  /** Optional ?ref=CODE value from the signup redirect. Attaches the
   *  resulting User.referredById and, on trial→paid conversion later,
   *  credits the referrer via ReferralConversion. */
  referralCodeFromSignup?: string | null;
}): Promise<void> {
  const { userId, email, referralCodeFromSignup } = params;
  const { prisma } = await import("@/lib/prisma");
  const { track } = await import("@/lib/posthog");
  const { generateReferralCode, resolveReferrerByCode } = await import(
    "@/lib/referrals"
  );

  const baseTrialDays = await trialDaysForEmail(email);

  // Resolve a referrer ID if the signup flow passed a code. We look up
  // BEFORE the user.update below so a single write seeds both trial
  // state and the referral attribution atomically.
  let referredById: string | null = null;
  if (referralCodeFromSignup) {
    referredById = await resolveReferrerByCode(prisma, referralCodeFromSignup);
  }

  // First 100 signups are Founding Members — 30-day trial instead of 14.
  // Count existing founding members to determine eligibility and number.
  const FOUNDING_MEMBER_CAP = 100;
  const FOUNDING_MEMBER_TRIAL_DAYS = 30;
  const foundingCount = await prisma.user.count({
    where: { isFoundingMember: true },
  });
  const isFoundingMember = foundingCount < FOUNDING_MEMBER_CAP;
  const foundingMemberNumber = isFoundingMember ? foundingCount + 1 : null;

  // Founding members get 30-day trial. Standard users get base trial.
  // Referral bonus stacks on top of either.
  const effectiveBaseDays = isFoundingMember
    ? FOUNDING_MEMBER_TRIAL_DAYS
    : baseTrialDays;
  const trialDays = effectiveBaseDays + (referredById ? 30 : 0);
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  // Issue a referral code up-front. Retry-on-collision a few times —
  // 32^8 ≈ 10^12 codes, collisions are astronomically rare at beta
  // scale, but the loop guards a freak clash without failing signup.
  let code = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.user.findFirst({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) break;
    code = generateReferralCode();
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "TRIAL",
      trialEndsAt,
      referralCode: code,
      isFoundingMember,
      foundingMemberNumber,
      ...(referredById ? { referredById } : {}),
    },
  });

  await track(userId, "trial_started", {
    trialEndsAt: trialEndsAt.toISOString(),
    trialDays,
    reducedTrial: trialDays < 14,
    isFoundingMember,
    foundingMemberNumber,
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

  // Send welcome_day0 inline (spec: within 60 seconds of signup, not
  // from the hourly orchestrator). Fail-soft — a send failure must not
  // brick signup. The TrialEmailLog unique constraint makes this safe
  // to re-invoke on a retried signup path: the second attempt returns
  // `already_sent` without re-dispatching.
  try {
    const { sendTrialEmail } = await import("@/lib/trial-emails");
    await sendTrialEmail(userId, "welcome_day0");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap-user] welcome_day0 send failed:", err);
  }
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
