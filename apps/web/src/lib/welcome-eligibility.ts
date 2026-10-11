/**
 * Who the mobile app should send into the funnel welcome flow
 * (apps/mobile/app/welcome.tsx, Ripple 1.9). 2026-10-11.
 *
 * Why this is its own flag: since the 2026-10-04 hotfix
 * (lib/app-onboarding.ts) /api/user/me reports every PRO user and every
 * Stripe TRIAL user as `onboardingCompleted: true`, so the app can't use
 * that flag to spot a web buyer who hasn't been set up yet. This one reads
 * the real UserOnboarding.completedAt instead.
 *
 * Eligible = a web (Stripe) subscriber, PRO or TRIAL, whose onboarding was
 * never actually completed, and who has either
 *   - no entries yet, or
 *   - exactly one entry, and it came from the web funnel's first debrief
 *     (a `funnel_first_debrief_submitted` event exists). The app then skips
 *     its record step and shows that entry's results instead.
 * Anyone with an entry recorded in the app already uses the app and is
 * left alone.
 */

export type WelcomeFacts = {
  subscriptionStatus: string | null | undefined;
  subscriptionSource: string | null | undefined;
  /** The real UserOnboarding.completedAt (not the hotfixed boolean). */
  onboardingCompletedAt: Date | null | undefined;
};

/** Cheap first check, so the extra queries only run for possible matches. */
export function mayBeWelcomeEligible(f: WelcomeFacts): boolean {
  if (f.onboardingCompletedAt) return false;
  if (f.subscriptionSource !== "stripe") return false;
  return f.subscriptionStatus === "PRO" || f.subscriptionStatus === "TRIAL";
}

export type WelcomeDecision = {
  welcomeEligible: boolean;
  /** The web first-debrief entry the app should show results for. */
  webDebriefEntryId: string | null;
};

export function decideWelcome(
  f: WelcomeFacts,
  entryIds: string[],
  hasWebDebriefEvent: boolean
): WelcomeDecision {
  const no = { welcomeEligible: false, webDebriefEntryId: null };
  if (!mayBeWelcomeEligible(f)) return no;
  if (entryIds.length === 0) return { welcomeEligible: true, webDebriefEntryId: null };
  if (entryIds.length === 1 && hasWebDebriefEvent) {
    return { welcomeEligible: true, webDebriefEntryId: entryIds[0] };
  }
  return no;
}

/** "Current state" of an append-only consent ledger = the latest row. */
export function latestGrant(rows: { granted: boolean }[]): boolean {
  return rows.length > 0 ? rows[0].granted : false;
}

export type WelcomeFields = WelcomeDecision & {
  /** Latest Art. 9 (special_category_processing) ledger row is a grant. */
  hasAiConsent: boolean;
};

/**
 * The three fields /api/user/me and the mobile sign-in responses send.
 * Pass `facts` when the caller already has them; otherwise they're read
 * here. The extra queries only run for possible matches, and any failure
 * fails closed (no welcome flow) rather than breaking sign-in.
 */
export async function loadWelcomeFields(userId: string, facts?: WelcomeFacts): Promise<WelcomeFields> {
  const none: WelcomeFields = { welcomeEligible: false, webDebriefEntryId: null, hasAiConsent: false };
  try {
    const { prisma } = await import("@/lib/prisma");
    let f = facts;
    if (!f) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true, subscriptionSource: true, onboarding: { select: { completedAt: true } } },
      });
      if (!u) return none;
      f = {
        subscriptionStatus: u.subscriptionStatus,
        subscriptionSource: u.subscriptionSource,
        onboardingCompletedAt: u.onboarding?.completedAt ?? null,
      };
    }
    if (!mayBeWelcomeEligible(f)) return none;
    const [entries, webDebrief, consents] = await Promise.all([
      prisma.entry.findMany({ where: { userId }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 2 }),
      prisma.onboardingEvent.findFirst({
        where: { userId, event: "funnel_first_debrief_submitted" },
        select: { id: true },
      }),
      prisma.consentRecord.findMany({
        where: { userId, consentType: "special_category_processing" },
        select: { granted: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      }),
    ]);
    return {
      ...decideWelcome(f, entries.map((e) => e.id), Boolean(webDebrief)),
      hasAiConsent: latestGrant(consents),
    };
  } catch (err) {
    console.warn("[welcome-eligibility] failed:", err);
    return none;
  }
}
