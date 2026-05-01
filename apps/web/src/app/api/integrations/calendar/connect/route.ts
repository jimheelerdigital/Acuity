/**
 * POST /api/integrations/calendar/connect
 *
 * Real connect flow (slice C5a). Replaces the v1.0-launch 501 stub.
 *
 * Records the user's chosen calendar provider + target calendar +
 * sync preferences on the User row. Does not call any provider
 * SDK — the actual EventKit / Google API calls happen on mobile
 * (Phase A iOS) or are deferred to the Phase B post-launch web
 * Google OAuth flow.
 *
 * Body shape:
 *   {
 *     "provider": "ios_eventkit" | "google" | "outlook",
 *     "targetCalendarId": "<provider-side calendar id>",
 *     "targetCalendarTitle"?: "<human-readable for UI>",
 *     "autoSendTasks"?: boolean,        // default false
 *     "defaultEventDuration"?: "ALL_DAY" | "TIMED"   // default TIMED
 *   }
 *
 * Returns 200 with the saved fields on success. Idempotent — calling
 * twice with the same provider replaces the prior connection (e.g.
 * user disconnected then reconnected on a new device).
 *
 * Gates (in order):
 *   1. Auth — getAnySessionUserId
 *   2. Tier — requireEntitlement("canSyncCalendar") (slice C1)
 *   3. Feature flag — calendar_integrations
 */

import { NextRequest, NextResponse } from "next/server";

import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PROVIDERS = ["ios_eventkit", "google", "outlook"] as const;
const VALID_DURATIONS = ["ALL_DAY", "TIMED"] as const;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gated = await requireEntitlement("canSyncCalendar", userId);
  if (!gated.ok) return gated.response;

  const flagGated = await gateFeatureFlag(userId, "calendar_integrations");
  if (flagGated) return flagGated;

  const body = (await req.json().catch(() => null)) as {
    provider?: unknown;
    targetCalendarId?: unknown;
    autoSendTasks?: unknown;
    defaultEventDuration?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    typeof body.provider !== "string" ||
    !VALID_PROVIDERS.includes(body.provider as (typeof VALID_PROVIDERS)[number])
  ) {
    return NextResponse.json(
      { error: "Invalid provider" },
      { status: 400 }
    );
  }
  if (
    typeof body.targetCalendarId !== "string" ||
    body.targetCalendarId.length === 0 ||
    body.targetCalendarId.length > 256
  ) {
    return NextResponse.json(
      { error: "Invalid targetCalendarId" },
      { status: 400 }
    );
  }

  const autoSendTasks =
    typeof body.autoSendTasks === "boolean" ? body.autoSendTasks : false;

  // defaultEventDuration: only update if the caller passes a valid
  // value. Unset = keep whatever User.defaultEventDuration was
  // (default "TIMED" from C3 schema).
  const duration =
    typeof body.defaultEventDuration === "string" &&
    VALID_DURATIONS.includes(
      body.defaultEventDuration as (typeof VALID_DURATIONS)[number]
    )
      ? body.defaultEventDuration
      : undefined;

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      calendarConnectedProvider: body.provider,
      calendarConnectedAt: new Date(),
      targetCalendarId: body.targetCalendarId,
      autoSendTasks,
      ...(duration ? { defaultEventDuration: duration } : {}),
    },
    select: {
      calendarConnectedProvider: true,
      calendarConnectedAt: true,
      targetCalendarId: true,
      autoSendTasks: true,
      defaultEventDuration: true,
    },
  });

  safeLog.info("calendar.connect", {
    userId,
    provider: user.calendarConnectedProvider,
    autoSendTasks: user.autoSendTasks,
    defaultEventDuration: user.defaultEventDuration,
  });

  return NextResponse.json({ ok: true, calendar: user });
}
