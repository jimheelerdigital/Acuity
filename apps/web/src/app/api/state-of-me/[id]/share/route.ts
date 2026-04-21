/**
 * POST /api/state-of-me/[id]/share — generate or refresh a public
 * link. Same shape as /api/weekly/[id]/share.
 * DELETE .../share — revoke.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_EXTEND_DAYS = 30;
const MAX_EXTEND_DAYS = 90;

function generateShareId(): string {
  return randomBytes(16).toString("base64url");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforceUserRateLimit("shareLink", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { extendDays?: unknown };
  const extendDays =
    typeof body.extendDays === "number" &&
    body.extendDays > 0 &&
    body.extendDays <= MAX_EXTEND_DAYS
      ? Math.round(body.extendDays)
      : DEFAULT_EXTEND_DAYS;

  const { prisma } = await import("@/lib/prisma");

  const report = await prisma.stateOfMeReport.findFirst({
    where: { id: params.id, userId, status: "COMPLETE" },
    select: { id: true, publicShareId: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Not found or not complete" }, { status: 404 });
  }

  let shareId = report.publicShareId;
  if (!shareId) {
    for (let i = 0; i < 5; i++) {
      const candidate = generateShareId();
      const existing = await prisma.stateOfMeReport.findFirst({
        where: { publicShareId: candidate },
        select: { id: true },
      });
      if (!existing) {
        shareId = candidate;
        break;
      }
    }
  }
  if (!shareId) {
    return NextResponse.json({ error: "Share id allocation failed" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000);
  await prisma.stateOfMeReport.update({
    where: { id: report.id },
    data: { publicShareId: shareId, publicShareExpiresAt: expiresAt },
  });

  return NextResponse.json({
    publicShareId: shareId,
    url: `${appUrl()}/shared/state-of-me/${shareId}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prisma } = await import("@/lib/prisma");
  const report = await prisma.stateOfMeReport.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.stateOfMeReport.update({
    where: { id: report.id },
    data: { publicShareId: null, publicShareExpiresAt: null },
  });
  return NextResponse.json({ ok: true });
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}
