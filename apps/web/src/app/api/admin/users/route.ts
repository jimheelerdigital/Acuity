/**
 * GET /api/admin/users
 *   ?q=<substring>      optional — matches email (case-insensitive)
 *   ?cursor=<userId>    optional — keyset pagination cursor
 *   ?limit=<1..100>     default 50
 *
 * METADATA ONLY. No entries, transcripts, goals, tasks, audio, or
 * observations. Entry count is a bare integer.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 50, 1), 100);

  const where = q
    ? { email: { contains: q, mode: "insensitive" as const } }
    : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastSeenAt: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      _count: { select: { entries: true } },
    },
  });

  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;

  return NextResponse.json({
    users: page.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      subscriptionStatus: u.subscriptionStatus,
      trialEndsAt: u.trialEndsAt,
      entryCount: u._count.entries,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
