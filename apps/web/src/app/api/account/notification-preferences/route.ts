/**
 * GET  /api/account/notification-preferences
 * PUT  /api/account/notification-preferences
 *
 * Read / update the signed-in user's smart-notification preferences. Auth via
 * cookie (web) or Bearer (mobile) — getAnySessionUserId covers both. Shared by
 * the web /account Notifications section and the mobile Notifications screen.
 *
 * GET lazily creates the row with default-ON categories on first read so a
 * brand-new user sees sensible defaults without a write. PUT validates every
 * field against @acuity/shared and upserts.
 *
 * v1 is email-only — pushEnabled is accepted/stored but the engine ignores it
 * until the mobile push-token registration slice ships. See
 * docs/specs/smart-notifications-spec.md.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ENABLED_CATEGORIES,
  NOTIFICATION_FREE_MAX_PER_WEEK,
  NOTIFICATION_PRO_MAX_PER_DAY,
  isNotificationCategory,
  isValidHHMM,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationTone,
} from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PrefsRow = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  enabledCategories: string[];
  tone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string | null;
  maxPerDay: number;
  maxPerWeek: number;
  pausedUntil: Date | null;
};

const PREFS_SELECT = {
  pushEnabled: true,
  emailEnabled: true,
  enabledCategories: true,
  tone: true,
  quietHoursStart: true,
  quietHoursEnd: true,
  timezone: true,
  maxPerDay: true,
  maxPerWeek: true,
  pausedUntil: true,
} as const;

/** DB row → client-facing shape (filters unknown categories, coerces tone). */
function toClientShape(row: PrefsRow): NotificationPreferences {
  return {
    pushEnabled: row.pushEnabled,
    emailEnabled: row.emailEnabled,
    enabledCategories: row.enabledCategories.filter(
      isNotificationCategory
    ) as NotificationCategory[],
    tone: row.tone === "direct" ? "direct" : "caring",
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timezone: row.timezone,
    maxPerDay: row.maxPerDay,
    maxPerWeek: row.maxPerWeek,
    pausedUntil: row.pausedUntil ? row.pausedUntil.toISOString() : null,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  // Lazy create with defaults on first read.
  const row = await prisma.userNotificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      enabledCategories: [...DEFAULT_ENABLED_CATEGORIES],
      maxPerDay: NOTIFICATION_PRO_MAX_PER_DAY,
      maxPerWeek: NOTIFICATION_FREE_MAX_PER_WEEK,
    },
    update: {},
    select: PREFS_SELECT,
  });

  return NextResponse.json({ preferences: toClientShape(row) });
}

export async function PUT(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.pushEnabled === "boolean") update.pushEnabled = body.pushEnabled;
  if (typeof body.emailEnabled === "boolean")
    update.emailEnabled = body.emailEnabled;

  if (Array.isArray(body.enabledCategories)) {
    const cats = Array.from(
      new Set(
        body.enabledCategories.filter(
          (c): c is string => typeof c === "string" && isNotificationCategory(c)
        )
      )
    );
    update.enabledCategories = cats;
  }

  if (body.tone === "caring" || body.tone === "direct") {
    update.tone = body.tone as NotificationTone;
  }

  if (typeof body.quietHoursStart === "string" && isValidHHMM(body.quietHoursStart)) {
    update.quietHoursStart = body.quietHoursStart;
  }
  if (typeof body.quietHoursEnd === "string" && isValidHHMM(body.quietHoursEnd)) {
    update.quietHoursEnd = body.quietHoursEnd;
  }

  if (typeof body.timezone === "string" && body.timezone.length <= 64) {
    update.timezone = body.timezone;
  } else if (body.timezone === null) {
    update.timezone = null;
  }

  // Caps are clamped to a sane range; plan enforcement happens in the scheduler.
  if (typeof body.maxPerDay === "number" && Number.isFinite(body.maxPerDay)) {
    update.maxPerDay = Math.min(3, Math.max(0, Math.round(body.maxPerDay)));
  }
  if (typeof body.maxPerWeek === "number" && Number.isFinite(body.maxPerWeek)) {
    update.maxPerWeek = Math.min(7, Math.max(0, Math.round(body.maxPerWeek)));
  }

  // Snooze. Accept an ISO instant or null (resume now). Reject past/garbage.
  if (body.pausedUntil === null) {
    update.pausedUntil = null;
  } else if (typeof body.pausedUntil === "string") {
    const d = new Date(body.pausedUntil);
    if (!Number.isNaN(d.getTime())) update.pausedUntil = d;
  }

  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.userNotificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      enabledCategories: [...DEFAULT_ENABLED_CATEGORIES],
      maxPerDay: NOTIFICATION_PRO_MAX_PER_DAY,
      maxPerWeek: NOTIFICATION_FREE_MAX_PER_WEEK,
      ...update,
    },
    update,
    select: PREFS_SELECT,
  });

  return NextResponse.json({ ok: true, preferences: toClientShape(row) });
}
