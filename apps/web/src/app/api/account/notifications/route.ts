/**
 * POST /api/account/notifications
 *
 * Update the signed-in user's reminder preferences (single-reminder
 * shape). Kept for backwards compat with mobile builds before Slice C
 * (2026-05-09 multi-reminder support).
 *
 * Body: {
 *   notificationTime?: "HH:MM",
 *   notificationDays?: number[] (0..6),
 *   notificationsEnabled?: boolean
 * }
 *
 * Slice C dual-write: when this endpoint updates the legacy User.*
 * fields, it ALSO upserts the user's primary UserReminder row
 * (sortOrder=0) so the new model stays in sync. Older clients keep
 * working; newer clients see consistent state. After all clients
 * migrate to /api/account/reminders, this endpoint becomes a thin
 * shim and can be removed in a follow-up cleanup.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    notificationTime?: unknown;
    notificationDays?: unknown;
    notificationsEnabled?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.notificationTime === "string" && /^\d{2}:\d{2}$/.test(body.notificationTime)) {
    update.notificationTime = body.notificationTime;
  }
  if (Array.isArray(body.notificationDays)) {
    const days = body.notificationDays
      .map((d) => (typeof d === "number" ? Math.round(d) : NaN))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6) as number[];
    update.notificationDays = Array.from(new Set(days)).sort();
  }
  if (typeof body.notificationsEnabled === "boolean") {
    update.notificationsEnabled = body.notificationsEnabled;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
    },
  });

  // Slice C dual-write: keep the user's primary UserReminder
  // (sortOrder=0) in sync with the legacy fields. If they have no
  // reminders yet, create one. If they have one, update it. If they
  // have multiple, only the primary is touched — the secondary
  // reminders managed via /api/account/reminders stay as-is. This is
  // the "single-time clients keep working" path; multi-reminder
  // clients use /api/account/reminders directly.
  try {
    const primary = await prisma.userReminder.findFirst({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (primary) {
      await prisma.userReminder.update({
        where: { id: primary.id },
        data: {
          time: user.notificationTime,
          daysActive: user.notificationDays,
          enabled: user.notificationsEnabled,
        },
      });
    } else if (
      user.notificationsEnabled ||
      user.notificationTime !== "21:00"
    ) {
      // Mirror the conservative-create policy from the bulk backfill
      // and lazy-GET — only materialize a UserReminder row when the
      // user has actually engaged with the feature.
      await prisma.userReminder.create({
        data: {
          userId,
          time: user.notificationTime,
          daysActive: user.notificationDays,
          enabled: user.notificationsEnabled,
          sortOrder: 0,
        },
      });
    }
  } catch (err) {
    // Dual-write is best-effort. The legacy fields ARE the source of
    // truth for old clients; if the new-model write fails we don't
    // want to break those callers. Surfaced via console for review.
    console.warn(
      "[account/notifications] dual-write to UserReminder failed:",
      err
    );
  }

  return NextResponse.json({ ok: true, user });
}
