/**
 * GET /api/people/[id]   (slice 8 v1.2 — mobile-facing detail fetch)
 * PATCH /api/people/[id] (slice 5 v1.2 — rename)
 *
 * GET returns the Person row + its mention timeline (most-recent
 * TIMELINE_LIMIT) with the entry context for each mention. Mirrors
 * what the web /insights/people/[id] page renders via direct Prisma.
 *
 * PATCH body: { displayName: string }. Renames cosmetically — we
 * never touch canonicalName, which is the resolver's matching key.
 * 1-80 chars, trimmed.
 *
 * Authorization on both: caller must own the Person.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  displayName?: unknown;
}

const MAX_LEN = 80;
const TIMELINE_LIMIT = 50;

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const person = await prisma.person.findFirst({
    where: { id: ctx.params.id, userId, archived: false },
    select: {
      id: true,
      displayName: true,
      mentionCount: true,
      firstMentionedAt: true,
    },
  });
  if (!person) {
    return NextResponse.json({ error: "NotFound" }, { status: 404 });
  }

  const mentions = await prisma.entityMention.findMany({
    where: { personId: person.id },
    orderBy: { createdAt: "desc" },
    take: TIMELINE_LIMIT,
    select: {
      id: true,
      mentionText: true,
      context: true,
      createdAt: true,
      entry: {
        select: { id: true, createdAt: true, mood: true, themes: true },
      },
    },
  });

  return NextResponse.json({
    person: {
      id: person.id,
      displayName: person.displayName,
      mentionCount: person.mentionCount,
      firstMentionedAt: person.firstMentionedAt.toISOString(),
    },
    mentions: mentions
      .filter((m) => m.entry)
      .map((m) => ({
        id: m.id,
        mentionText: m.mentionText,
        context: m.context,
        createdAt: m.createdAt.toISOString(),
        entry: {
          id: m.entry!.id,
          createdAt: m.entry!.createdAt.toISOString(),
          mood: m.entry!.mood,
          themes: m.entry!.themes,
        },
      })),
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const next = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (next.length === 0 || next.length > MAX_LEN) {
    return NextResponse.json({ ok: false, error: "InvalidName" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const person = await prisma.person.findFirst({
    where: { id: ctx.params.id, userId },
    select: { id: true },
  });
  if (!person) {
    return NextResponse.json({ ok: false, error: "NotFound" }, { status: 404 });
  }

  await prisma.person.update({
    where: { id: person.id },
    data: { displayName: next },
  });

  return NextResponse.json({ ok: true, displayName: next });
}
