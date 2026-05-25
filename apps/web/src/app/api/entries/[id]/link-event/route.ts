/**
 * PATCH /api/entries/[id]/link-event
 *
 * Body: { eventId: string, action: "link" | "unlink" }
 *
 * Mutates Entry.linkedEventIds by adding or removing the given
 * CalendarEvent id. Slice 6 v1.2 Calendar Integration. Read-modify-
 * write inside a small transaction so two concurrent link/unlink
 * presses on the same entry can't lose updates.
 *
 * Authorization:
 *   - Caller must own the entry (Entry.userId === session userId).
 *   - The CalendarEvent must also belong to the caller — prevents
 *     a user from linking another user's event id by guessing.
 *
 * Idempotent in both directions: re-linking an already-linked event
 * is a no-op; unlinking a never-linked event is a no-op.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  eventId?: unknown;
  action?: unknown;
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
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const action = body.action === "link" || body.action === "unlink" ? body.action : null;
  if (!eventId || !action) {
    return NextResponse.json({ ok: false, error: "InvalidBody" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ ok: false, error: "EventNotFound" }, { status: 404 });
  }

  const entry = await prisma.entry.findFirst({
    where: { id: ctx.params.id, userId },
    select: { id: true, linkedEventIds: true },
  });
  if (!entry) {
    return NextResponse.json({ ok: false, error: "EntryNotFound" }, { status: 404 });
  }

  const current = new Set(entry.linkedEventIds ?? []);
  if (action === "link") current.add(eventId);
  else current.delete(eventId);

  await prisma.entry.update({
    where: { id: entry.id },
    data: { linkedEventIds: Array.from(current) },
  });

  return NextResponse.json({
    ok: true,
    linkedEventIds: Array.from(current),
  });
}
