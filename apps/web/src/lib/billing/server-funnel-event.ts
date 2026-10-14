import "server-only";

/**
 * Server-side funnel OnboardingEvent writer, for payment events observed
 * server-side (RevenueCat Web Billing webhook).
 *
 * Same behaviour as `logServerFunnelEvent` in api/stripe/webhook/route.ts
 * (which can't be imported from a route file): the row inherits the session
 * token / flowVersion / attribution of the user's most recent funnel_* event
 * so admin funnel analytics attribute it to the same session and ad; internal
 * users are flagged isBot. Never throws.
 */

import { safeLog } from "@/lib/safe-log";

type Db = (typeof import("@/lib/prisma"))["prisma"];

export async function logServerFunnelEvent(
  db: Db,
  opts: { userId: string; event: string; value: string; context: string }
): Promise<void> {
  const { userId, event, value, context } = opts;
  try {
    const ctx = await db.onboardingEvent.findFirst({
      where: { userId, event: { startsWith: "funnel_" }, sessionToken: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        sessionToken: true,
        flowVersion: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        fbclid: true,
      },
    });
    let internal = false;
    try {
      const { isInternalUser, isInternalSession } = await import("@/lib/internal-traffic");
      internal =
        (await isInternalUser(db, userId)) ||
        (await isInternalSession(db, ctx?.sessionToken ?? null, userId));
    } catch {
      internal = false;
    }
    await db.onboardingEvent.create({
      data: {
        userId,
        sessionToken: ctx?.sessionToken ?? null,
        event,
        value,
        flowVersion: ctx?.flowVersion ?? null,
        utmSource: ctx?.utmSource ?? null,
        utmMedium: ctx?.utmMedium ?? null,
        utmCampaign: ctx?.utmCampaign ?? null,
        utmContent: ctx?.utmContent ?? null,
        utmTerm: ctx?.utmTerm ?? null,
        fbclid: ctx?.fbclid ?? null,
        isBot: internal,
      },
    });
    if (!ctx?.sessionToken) {
      safeLog.info("billing.funnel-event-no-session", { context, userId, event });
    }
  } catch (err) {
    safeLog.warn("billing.funnel-event-write-failed", {
      context,
      event,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
