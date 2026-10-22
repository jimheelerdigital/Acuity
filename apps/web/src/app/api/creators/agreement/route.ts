/** POST /api/creators/agreement — accept the CURRENT creator agreement. */
import { NextResponse } from "next/server";

import { AGREEMENT_VERSION } from "@/lib/creators/config";
import { currentCreatorId } from "@/lib/creators/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const creatorId = await currentCreatorId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { prisma } = await import("@/lib/prisma");
  await prisma.ugcCreator.update({
    where: { id: creatorId },
    data: { agreementVersion: AGREEMENT_VERSION, agreementAcceptedAt: new Date() },
  });
  return NextResponse.json({ ok: true, version: AGREEMENT_VERSION });
}
