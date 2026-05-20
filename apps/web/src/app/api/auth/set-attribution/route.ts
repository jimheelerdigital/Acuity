import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { getAuthOptions } from "@/lib/auth";

/**
 * One-shot UTM attribution writer. Called after signup (password or OAuth)
 * to persist the acuity_attribution cookie data onto the User row.
 *
 * Write-once: only sets fields that are currently null (first-touch model).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  console.log("[attribution] POST /api/auth/set-attribution — user:", session.user.id, "data:", JSON.stringify(body));
  const {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referrer,
    landingPath,
  } = body ?? {};

  const { prisma } = await import("@/lib/prisma");

  // Only write if attribution hasn't been set yet (first-touch)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { signupUtmSource: true, signupUtmCampaign: true },
  });

  if (user?.signupUtmSource || user?.signupUtmCampaign) {
    return NextResponse.json({ ok: true, alreadySet: true });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(utm_source ? { signupUtmSource: String(utm_source) } : {}),
      ...(utm_medium ? { signupUtmMedium: String(utm_medium) } : {}),
      ...(utm_campaign ? { signupUtmCampaign: String(utm_campaign) } : {}),
      ...(utm_content ? { signupUtmContent: String(utm_content) } : {}),
      ...(utm_term ? { signupUtmTerm: String(utm_term) } : {}),
      ...(referrer ? { signupReferrer: String(referrer) } : {}),
      ...(landingPath ? { signupLandingPath: String(landingPath) } : {}),
    },
  });

  // Send founder notification now that attribution is persisted. OAuth
  // signups skip the notification in bootstrapNewUser (no attribution at
  // that point) and defer it here so the email shows real UTM data.
  try {
    const fullUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        isFoundingMember: true,
        foundingMemberNumber: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });
    if (fullUser) {
      const trialDays = fullUser.trialEndsAt
        ? Math.round((fullUser.trialEndsAt.getTime() - fullUser.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : 14;
      const { notifyFoundersOfSignup } = await import("@/lib/founder-notifications");
      await notifyFoundersOfSignup({
        userId: session.user.id,
        email: fullUser.email,
        isFoundingMember: fullUser.isFoundingMember ?? false,
        foundingMemberNumber: fullUser.foundingMemberNumber ?? null,
        trialDays,
        attribution: {
          utmSource: utm_source ? String(utm_source) : undefined,
          utmMedium: utm_medium ? String(utm_medium) : undefined,
          utmCampaign: utm_campaign ? String(utm_campaign) : undefined,
          utmContent: utm_content ? String(utm_content) : undefined,
          utmTerm: utm_term ? String(utm_term) : undefined,
          referrer: referrer ? String(referrer) : undefined,
          landingPath: landingPath ? String(landingPath) : undefined,
        },
      });
    }
  } catch (err) {
    // Fail-soft — attribution is already saved, notification is best-effort
    console.error("[set-attribution] founder notification failed:", err);
  }

  return NextResponse.json({ ok: true });
}
