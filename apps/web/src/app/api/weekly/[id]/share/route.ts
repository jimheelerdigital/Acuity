/**
 * Weekly report share management.
 *
 *   POST /api/weekly/[id]/share   — create or refresh a public share
 *                                   link. Body: { extendDays?: number }
 *                                   (defaults to 30). Response: { url, expiresAt }.
 *   DELETE .../share              — revoke the share link.
 *
 * Auth: owner only. publicShareId is a 22-char nanoid-style token
 * generated server-side (random base-62). Unique across all users so
 * a guessable share URL isn't constructible from (userId, weekNumber).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_EXTEND_DAYS = 30;
const MAX_EXTEND_DAYS = 90;

function generateShareId(): string {
  // 16 bytes → 22 base64url chars after trimming padding. Matches the
  // cuid/nanoid length our other public ids use.
  return randomBytes(16).toString("base64url");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    extendDays?: unknown;
  };
  const extendDays =
    typeof body.extendDays === "number" &&
    body.extendDays > 0 &&
    body.extendDays <= MAX_EXTEND_DAYS
      ? Math.round(body.extendDays)
      : DEFAULT_EXTEND_DAYS;

  const { prisma } = await import("@/lib/prisma");

  const report = await prisma.weeklyReport.findFirst({
    where: { id: params.id, userId, status: "COMPLETE" },
    select: { id: true, publicShareId: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Not found or not complete" }, { status: 404 });
  }

  // Reuse existing id on re-share so a shared link that's already
  // out in the wild stays valid when the user extends.
  let shareId = report.publicShareId;
  if (!shareId) {
    // Retry-on-collision loop. Unique constraint makes the odds of a
    // collision astronomical; defensive loop covers the freak case.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateShareId();
      const existing = await prisma.weeklyReport.findFirst({
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
  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: { publicShareId: shareId, publicShareExpiresAt: expiresAt },
  });

  return NextResponse.json({
    publicShareId: shareId,
    url: `${appUrl()}/shared/weekly/${shareId}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const report = await prisma.weeklyReport.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.weeklyReport.update({
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
