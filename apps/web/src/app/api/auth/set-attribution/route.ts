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

  return NextResponse.json({ ok: true });
}
