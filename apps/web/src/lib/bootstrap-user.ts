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
  /** First-touch UTM attribution from the acuity_attribution cookie. */
  attribution?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    referrer?: string;
    landingPath?: string;
  };
  /**
   * Suppress the inline welcome_day0 trial email send. Email/password
   * signup paths set this to true because they fire a combined
   * welcome+verify email separately (apps/web/src/emails/welcome-verify.ts)
   * — bundling avoids the dual-email-in-inbox confusion that hit the
   * 2026-05-12 TestFlight signup test. OAuth + magic-link paths (which
   * have pre-verified emails and don't send a verify email) leave this
   * undefined so they still get welcome_day0 inline.
   */
  skipWelcomeEmail?: boolean;
}): Promise<void> {
  const { userId, email, referralCodeFromSignup, attribution, skipWelcomeEmail } = params;
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

  // Trial / referral / attribution write. Wrapped so a missing
  // recently-added column (schema declared, prod DB not yet pushed)
  // doesn't cascade into Google OAuth callback failure.
  //
  // 2026-04-28 incident: the `signupUtm*` columns were schema-only
  // for several hours; PrismaAdapter.createUser succeeded but THIS
  // update threw P2022, the OAuth flow surfaced as ?error=Callback,
  // user bounced back to /auth/signin with no actionable message.
  //
  // Strategy: try the full update; on P2022 ("column does not
  // exist") strip the offending column and retry. Same shape as
  // safeUpdateUser in /api/onboarding/update.
  const fullData: Record<string, unknown> = {
    subscriptionStatus: "TRIAL",
    trialEndsAt,
    referralCode: code,
    isFoundingMember,
    foundingMemberNumber,
    ...(referredById ? { referredById } : {}),
    ...(attribution?.utmSource ? { signupUtmSource: attribution.utmSource } : {}),
    ...(attribution?.utmMedium ? { signupUtmMedium: attribution.utmMedium } : {}),
    ...(attribution?.utmCampaign ? { signupUtmCampaign: attribution.utmCampaign } : {}),
    ...(attribution?.utmContent ? { signupUtmContent: attribution.utmContent } : {}),
    ...(attribution?.utmTerm ? { signupUtmTerm: attribution.utmTerm } : {}),
    ...(attribution?.referrer ? { signupReferrer: attribution.referrer } : {}),
    ...(attribution?.landingPath ? { signupLandingPath: attribution.landingPath } : {}),
  };
  await safeUpdateUserBootstrap(userId, fullData);

  await track(userId, "trial_started", {
    trialEndsAt: trialEndsAt.toISOString(),
    trialDays,
    reducedTrial: trialDays < 14,
    isFoundingMember,
    foundingMemberNumber,
    email,
    utmSource: attribution?.utmSource ?? null,
    utmMedium: attribution?.utmMedium ?? null,
    utmCampaign: attribution?.utmCampaign ?? null,
    landingPath: attribution?.landingPath ?? null,
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
  //
  // Email/password signup paths pass skipWelcomeEmail=true because they
  // send a combined welcome+verify email separately. OAuth + magic-link
  // paths still get welcome_day0 here (their emails are pre-verified so
  // they don't need a verify CTA at all).
  if (!skipWelcomeEmail) {
    try {
      const { sendTrialEmail } = await import("@/lib/trial-emails");
      await sendTrialEmail(userId, "welcome_day0");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[bootstrap-user] welcome_day0 send failed:", err);
    }
  }

  // Notify founders (Keenan + Jimmy) of the new signup in real time.
  // Fail-soft — same pattern as welcome_day0. Never blocks signup.
  try {
    const { notifyFoundersOfSignup } = await import(
      "@/lib/founder-notifications"
    );
    await notifyFoundersOfSignup({
      userId,
      email,
      isFoundingMember,
      foundingMemberNumber,
      trialDays,
      attribution,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap-user] founder notification failed:", err);
  }
}

/**
 * Canonicalize an email so plus-addressing variants of the same address
 * collapse to a single identity. `alice+spam@gmail.com` and
 * `alice@gmail.com` route to the same Gmail inbox, so they must hash
 * to the same DeletedUser key — otherwise an attacker can farm fresh
 * 14-day trials by signing up with `alice+1@`, `alice+2@`, etc., each
 * of which evades the tombstone lookup.
 *
 * Applied to all email addresses (not just Gmail) — every major
 * provider that supports `+` aliasing routes the variants to the same
 * mailbox, and providers that don't support aliasing won't have a `+`
 * in their addresses to strip.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.toLowerCase().trim();
  const atIdx = trimmed.indexOf("@");
  if (atIdx === -1) return trimmed;
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);
  const plusIdx = local.indexOf("+");
  const cleanLocal = plusIdx === -1 ? local : local.slice(0, plusIdx);
  return `${cleanLocal}${domain}`;
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
  const canonical = canonicalizeEmail(email);
  // Look up both the canonical form and the literal lowercased form so
  // legacy DeletedUser rows (written before canonicalization landed) still
  // catch their owners. New tombstones write the canonical form only.
  const literal = email.toLowerCase().trim();
  const candidates =
    canonical === literal ? [canonical] : [canonical, literal];
  const deleted = await prisma.deletedUser.findFirst({
    where: { email: { in: candidates } },
    orderBy: { deletedAt: "desc" },
  });
  if (!deleted) return STANDARD_TRIAL_DAYS;

  const daysSince =
    (Date.now() - deleted.deletedAt.getTime()) / (24 * 60 * 60 * 1000);
  return daysSince < LOOKBACK_DAYS ? REDUCED_TRIAL_DAYS : STANDARD_TRIAL_DAYS;
}

/**
 * Update User during bootstrap, surviving schema-vs-DB column drift.
 *
 * If the prod DB is missing a column the schema declares, Prisma
 * throws P2022 "column does not exist" on update. We catch that one
 * specific error, strip the offending field from `data`, and retry —
 * once per missing column, capped at the size of `data` to prevent
 * pathological loops. Trial fields (subscriptionStatus, trialEndsAt,
 * referralCode) always make it through; only the optional attribution
 * fields get dropped if they're not yet on the DB.
 *
 * This mirrors safeUpdateUser in /api/onboarding/update — the same
 * shape was needed there for User.targetCadence drift on 2026-04-27.
 * Ideally `prisma db push` would always run before deploy, but the
 * push has to come from a network that can reach Supabase directly,
 * and that has been intermittent.
 */
async function safeUpdateUserBootstrap(
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const remaining: Record<string, unknown> = { ...data };
  const maxAttempts = Object.keys(remaining).length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await prisma.user.update({ where: { id: userId }, data: remaining });
      return;
    } catch (err) {
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (code !== "P2022" && !/column.*does not exist/i.test(msg)) {
        throw err;
      }

      // Extract the offending column name. P2022 error message format:
      //   "The column `User.signupUtmSource` does not exist..."
      const match = msg.match(/column `?([\w.]+)`? does not exist/i);
      const fullName = match?.[1] ?? "";
      const colName = fullName.includes(".")
        ? fullName.split(".").pop()!
        : fullName;
      if (!colName || !(colName in remaining)) {
        // Couldn't parse the column name OR it isn't in our payload —
        // not safe to retry blindly. Re-throw so it surfaces in logs.
        throw err;
      }

      console.warn(
        `[bootstrap-user] dropping ${colName} from update — column not yet pushed to DB. Schema fix on next deploy after \`prisma db push\`.`
      );
      delete remaining[colName];

      // If we've stripped the entire payload there's nothing left to
      // update. Bail successfully — the User row already exists.
      if (Object.keys(remaining).length === 0) return;
    }
  }
}
