/**
 * GET / PUT /api/account/reminders
 *
 * Multi-reminder support (Slice C, 2026-05-09). Replaces the single-
 * reminder pattern of /api/account/notifications. The mobile reminders
 * screen uses this endpoint; legacy /api/account/notifications stays
 * for backwards compat with not-yet-updated clients.
 *
 * GET — list the user's reminders, oldest sortOrder first. Lazy
 * backfill: if the user has zero reminders AND has any non-default
 * legacy notification preference, create one row from those legacy
 * fields and return it. This is the safety net for users not covered
 * by `apps/web/scripts/backfill-user-reminders.ts`.
 *
 * PUT — atomic replace-list. Body: { reminders: [{ time, daysActive,
 * enabled, sortOrder }, ...] }. Validation:
 *   - max 5 reminders per user (server-enforced cap; raise later if
 *     evidence suggests users want it)
 *   - time matches /^\d{2}:\d{2}$/
 *   - daysActive ⊆ {0..6}
 *   - enabled is boolean
 *   - sortOrder is non-negative integer (defaults to array index if
 *     omitted, so callers don't HAVE to think about ordering)
 *
 * The PUT runs in a transaction: deleteMany + createMany. Atomic so a
 * failed create doesn't leave the user with a partial state.
 *
 * Side-effect: PUT also updates the legacy User.notificationTime /
 * notificationDays / notificationsEnabled fields with the FIRST
 * enabled reminder's values, so older clients reading those fields
 * see something sensible. After all clients migrate (a few mobile-
 * build cycles), the legacy fields can be dropped in a cleanup slice.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REMINDERS_PER_USER = 5;
const HHMM_REGEX = /^\d{2}:\d{2}$/;

interface ReminderInput {
  time: string;
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
}

function validateReminderInput(
  raw: unknown,
  fallbackOrder: number
): ReminderInput | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Each reminder must be an object" };
  }
  const r = raw as {
    time?: unknown;
    daysActive?: unknown;
    enabled?: unknown;
    sortOrder?: unknown;
  };
  if (typeof r.time !== "string" || !HHMM_REGEX.test(r.time)) {
    return { error: "Each reminder needs a valid HH:MM time" };
  }
  if (!Array.isArray(r.daysActive)) {
    return { error: "daysActive must be an array of 0..6" };
  }
  const days = r.daysActive
    .map((d) => (typeof d === "number" ? Math.round(d) : NaN))
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6) as number[];
  const dedupedDays = Array.from(new Set(days)).sort();
  const enabled = typeof r.enabled === "boolean" ? r.enabled : true;
  const sortOrder =
    typeof r.sortOrder === "number" && Number.isFinite(r.sortOrder)
      ? Math.max(0, Math.round(r.sortOrder))
      : fallbackOrder;
  return {
    time: r.time,
    daysActive: dedupedDays,
    enabled,
    sortOrder,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userReminder.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (existing.length > 0) {
    return NextResponse.json({ reminders: existing });
  }

  // Lazy backfill from legacy User fields. Only fires once per user
  // (subsequent calls find the row created here).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Conservative — only backfill if the user actually engaged with the
  // legacy single-reminder feature (matches the bulk-script policy).
  const isDefaultUnengaged =
    !user.notificationsEnabled && user.notificationTime === "21:00";
  if (isDefaultUnengaged) {
    return NextResponse.json({ reminders: [] });
  }

  const created = await prisma.userReminder.create({
    data: {
      userId,
      time: user.notificationTime,
      daysActive: user.notificationDays,
      enabled: user.notificationsEnabled,
      sortOrder: 0,
    },
  });
  return NextResponse.json({ reminders: [created] });
}

export async function PUT(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    reminders?: unknown;
  } | null;
  if (!body || !Array.isArray(body.reminders)) {
    return NextResponse.json(
      { error: "Body must be { reminders: [...] }" },
      { status: 400 }
    );
  }

  if (body.reminders.length > MAX_REMINDERS_PER_USER) {
    return NextResponse.json(
      {
        error: `At most ${MAX_REMINDERS_PER_USER} reminders allowed.`,
        code: "TOO_MANY_REMINDERS",
      },
      { status: 400 }
    );
  }

  const validated: ReminderInput[] = [];
  for (let i = 0; i < body.reminders.length; i += 1) {
    const result = validateReminderInput(body.reminders[i], i);
    if ("error" in result) {
      return NextResponse.json(
        { error: `Reminder ${i + 1}: ${result.error}` },
        { status: 400 }
      );
    }
    validated.push(result);
  }

  const { prisma } = await import("@/lib/prisma");

  // Atomic replace-list. Plus dual-write to legacy User fields using
  // the first enabled reminder (preserves UX for older clients reading
  // notificationTime/Days/Enabled).
  const primary = validated.find((r) => r.enabled) ?? validated[0] ?? null;
  const legacyUpdate = primary
    ? {
        notificationTime: primary.time,
        notificationDays: primary.daysActive,
        notificationsEnabled: primary.enabled,
      }
    : {
        notificationsEnabled: false,
      };

  const [, , reminders] = await prisma.$transaction([
    prisma.userReminder.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: legacyUpdate,
    }),
    prisma.userReminder.createManyAndReturn({
      data: validated.map((r) => ({
        userId,
        time: r.time,
        daysActive: r.daysActive,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      })),
    }),
  ]);

  return NextResponse.json({ ok: true, reminders });
}
